import git from 'isomorphic-git'
import http from 'isomorphic-git/http/node'
import * as nodefs from 'fs'
import { writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { GitFileStatus, GitAuthor, SyncResult, CommitLog, GitHubRepo } from '../../types'

class GitService {
  // ── Repo detection ───────────────────────────────────────────────────────

  async isRepo(dir: string): Promise<boolean> {
    try {
      await git.resolveRef({ fs: nodefs, dir, ref: 'HEAD' })
      return true
    } catch {
      return false
    }
  }

  // ── Init / remote management ──────────────────────────────────────────────

  async init(dir: string): Promise<void> {
    await git.init({ fs: nodefs, dir, defaultBranch: 'main' })
    // Write a .gitignore so sync-state.json is never committed
    const gitignore = join(dir, '.gitignore')
    if (!existsSync(gitignore)) {
      writeFileSync(gitignore, '.mindpalace/sync-state.json\n.DS_Store\nThumbs.db\n', 'utf8')
    }
  }

  async addRemote(dir: string, url: string, remote = 'origin'): Promise<void> {
    try {
      await git.deleteRemote({ fs: nodefs, dir, remote })
    } catch {
      // remote didn't exist — fine
    }
    await git.addRemote({ fs: nodefs, dir, remote, url })
  }

  async getRemoteUrl(dir: string, remote = 'origin'): Promise<string | null> {
    try {
      const remotes = await git.listRemotes({ fs: nodefs, dir })
      return remotes.find((r) => r.remote === remote)?.url ?? null
    } catch {
      return null
    }
  }

  async getCurrentBranch(dir: string): Promise<string> {
    try {
      return (await git.currentBranch({ fs: nodefs, dir })) ?? 'main'
    } catch {
      return 'main'
    }
  }

  // ── Clone ─────────────────────────────────────────────────────────────────

  async clone(url: string, dir: string, token: string, branch = 'main'): Promise<void> {
    await git.clone({
      fs: nodefs,
      http,
      dir,
      url,
      ref: branch,
      singleBranch: true,
      depth: 50,
      onAuth: () => ({ username: token, password: '' })
    })
  }

  // ── Status ────────────────────────────────────────────────────────────────

  async status(dir: string): Promise<GitFileStatus[]> {
    try {
      const matrix = await git.statusMatrix({ fs: nodefs, dir })
      return matrix
        .filter(([, head, workdir, stage]) => !(head === 1 && workdir === 1 && stage === 1))
        .map(([filepath, head, workdir, stage]) => ({
          filepath: filepath as string,
          status: this.statusLabel(
            head as number,
            workdir as number,
            stage as number
          ) as GitFileStatus['status']
        }))
    } catch {
      return []
    }
  }

  private statusLabel(head: number, workdir: number, stage: number): string {
    if (head === 0 && workdir === 2 && stage === 0) return 'untracked'
    if (head === 0 && workdir === 2 && stage === 2) return 'added'
    if (head === 1 && workdir === 2 && stage === 1) return 'modified'
    if (head === 1 && workdir === 2 && stage === 2) return 'modified-staged'
    if (head === 1 && workdir === 0 && stage === 0) return 'deleted'
    if (head === 1 && workdir === 0 && stage === 1) return 'deleted-staged'
    return 'unknown'
  }

  // ── Stage / commit / push / pull ──────────────────────────────────────────

  async addAll(dir: string): Promise<void> {
    await git.add({ fs: nodefs, dir, filepath: '.' })
  }

  async hasChanges(dir: string): Promise<boolean> {
    const matrix = await git.statusMatrix({ fs: nodefs, dir })
    return matrix.some(([, head, workdir, stage]) => !(head === 1 && workdir === 1 && stage === 1))
  }

  async commit(dir: string, message: string, author: GitAuthor): Promise<string> {
    return git.commit({ fs: nodefs, dir, message, author })
  }

  async push(dir: string, token: string, remote = 'origin', branch = 'main'): Promise<void> {
    await git.push({
      fs: nodefs,
      http,
      dir,
      remote,
      ref: branch,
      onAuth: () => ({ username: token, password: '' })
    })
  }

  /**
   * Fetch the remote and hard-reset local HEAD + working tree to the remote branch.
   * Used when linking to an existing repo so we adopt remote history instead of
   * trying to push unrelated local history (which would give PushRejectedError).
   */
  async fetchAndReset(dir: string, token: string, branch = 'main'): Promise<void> {
    // Fetch all objects and remote refs
    await git.fetch({
      fs: nodefs,
      http,
      dir,
      remote: 'origin',
      ref: branch,
      singleBranch: true,
      depth: 50,
      onAuth: () => ({ username: token, password: '' })
    })

    // Point local branch to exactly the remote commit
    const remoteRef = `refs/remotes/origin/${branch}`
    const oid = await git.resolveRef({ fs: nodefs, dir, ref: remoteRef })
    await git.writeRef({ fs: nodefs, dir, ref: `refs/heads/${branch}`, value: oid, force: true })

    // Ensure HEAD points to the local branch
    await git.writeRef({
      fs: nodefs,
      dir,
      ref: 'HEAD',
      value: `ref: refs/heads/${branch}`,
      symbolic: true,
      force: true
    })

    // Checkout all files, overwriting anything local
    await git.checkout({ fs: nodefs, dir, ref: branch, force: true })
  }

  async pull(dir: string, token: string, author: GitAuthor, branch = 'main'): Promise<{ conflicts: string[] }> {
    try {
      await git.pull({
        fs: nodefs,
        http,
        dir,
        remote: 'origin',
        ref: branch,
        author,
        onAuth: () => ({ username: token, password: '' })
      })
      return { conflicts: [] }
    } catch (err: unknown) {
      const error = err as Error & { code?: string; data?: { filepath?: string } }
      if (
        error.code === 'CheckoutConflictError' ||
        error.code === 'MergeNotSupportedError' ||
        error.code === 'MergeConflictError'
      ) {
        const conflictFiles = error.data?.filepath
          ? [error.data.filepath]
          : await this.findConflictFiles(dir)
        return { conflicts: conflictFiles }
      }
      throw err
    }
  }

  // ── High-level sync ───────────────────────────────────────────────────────

  async sync(dir: string, token: string, author: GitAuthor, branch = 'main'): Promise<SyncResult> {
    const result: SyncResult = { pulled: false, pushed: false, conflicts: [] }

    // Stage everything
    await this.addAll(dir)

    // Commit only if there are staged changes
    if (await this.hasChanges(dir)) {
      await this.commit(dir, 'sync: auto-commit [MindPalace]', author)
    }

    // Pull
    const pullResult = await this.pull(dir, token, author, branch)
    result.pulled = true
    result.conflicts = pullResult.conflicts

    if (pullResult.conflicts.length > 0) {
      result.error = `Conflicts in: ${pullResult.conflicts.join(', ')}`
      return result
    }

    // Push — retry once if rejected (remote moved forward during our pull)
    try {
      await this.push(dir, token, 'origin', branch)
      result.pushed = true
    } catch (err: unknown) {
      const error = err as Error & { code?: string }
      if (error.code === 'PushRejectedError') {
        const retry = await this.pull(dir, token, author, branch)
        if (retry.conflicts.length === 0) {
          await this.push(dir, token, 'origin', branch)
          result.pushed = true
        } else {
          result.conflicts = retry.conflicts
          result.error = `Push rejected; conflicts found: ${retry.conflicts.join(', ')}`
        }
      } else {
        throw err
      }
    }

    return result
  }

  // ── Log ───────────────────────────────────────────────────────────────────

  async getLog(dir: string, depth = 20): Promise<CommitLog[]> {
    try {
      const commits = await git.log({ fs: nodefs, dir, depth })
      return commits.map((c) => ({
        oid: c.oid,
        message: c.commit.message.trim(),
        author: { name: c.commit.author.name, email: c.commit.author.email },
        timestamp: c.commit.author.timestamp * 1000
      }))
    } catch {
      return []
    }
  }

  // ── GitHub REST helpers ───────────────────────────────────────────────────

  async createGitHubRepo(name: string, token: string, isPrivate = true): Promise<string> {
    const resp = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        private: isPrivate,
        description: 'MindPalace vault',
        auto_init: false
      })
    })
    const repo = (await resp.json()) as Record<string, unknown>
    if (!repo.clone_url) {
      throw new Error((repo.message as string) ?? 'Failed to create GitHub repo')
    }
    return repo.clone_url as string
  }

  async listGitHubRepos(token: string): Promise<GitHubRepo[]> {
    const resp = await fetch(
      'https://api.github.com/user/repos?per_page=100&sort=updated&type=all',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    )
    const repos = (await resp.json()) as Array<Record<string, unknown>>
    if (!Array.isArray(repos)) return []
    return repos.map((r) => ({
      name: r.name as string,
      fullName: r.full_name as string,
      cloneUrl: r.clone_url as string,
      private: r.private as boolean
    }))
  }

  async deleteGitHubRepo(fullName: string, token: string): Promise<void> {
    await fetch(`https://api.github.com/repos/${fullName}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json'
      }
    })
  }

  // ── Conflict helpers ──────────────────────────────────────────────────────

  /** After a failed merge, find modified files (candidates for conflicts). */
  private async findConflictFiles(dir: string): Promise<string[]> {
    try {
      const matrix = await git.statusMatrix({ fs: nodefs, dir })
      // workdir=2 means file differs from stage — these are the modified/conflicted files
      return matrix
        .filter(([, , workdir]) => workdir === 2)
        .map(([filepath]) => filepath as string)
    } catch {
      return []
    }
  }

  /** Parse `<<<<<<< / ======= / >>>>>>>` markers and return the chosen side. */
  resolveConflictMarkers(content: string, resolution: 'ours' | 'theirs'): string {
    return content.replace(
      /<<<<<<< [^\n]+\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> [^\n]+\n/g,
      (_match, ours: string, theirs: string) => (resolution === 'ours' ? ours : theirs)
    )
  }
}

export const gitService = new GitService()
