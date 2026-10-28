export class RepositoryHelper {
  // Accepts any git remote form (git@host:org/repo.git, ssh://, https://user:token@host/...)
  // and returns a browsable https URL, or null if it can't be made safe to link to.
  static toBrowserUrl(remote: string | null | undefined): string | null {
    const value = remote?.trim();
    if (!value) return null;

    const scpLike = value.match(/^[\w.-]+@([\w.-]+):(.+)$/);
    const candidate = scpLike ? `https://${scpLike[1]}/${scpLike[2]}` : value;

    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      return null;
    }
    if (!['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol)) return null;

    const pathname = url.pathname.replace(/\/+$/, '').replace(/\.git$/, '');
    if (!/^\/[\w.-]+\/[\w.-]+/.test(pathname)) return null;

    return `https://${url.hostname}${pathname}`;
  }
}
