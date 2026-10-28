import { RepositoryHelper } from '../apiUtils/helpers/RepositoryHelper';

describe('RepositoryHelper.toBrowserUrl', () => {
  it.each([
    ['git@github.com:acme/app.git', 'https://github.com/acme/app'],
    ['https://github.com/acme/app.git', 'https://github.com/acme/app'],
    ['https://github.com/acme/app/', 'https://github.com/acme/app'],
    ['ssh://git@github.com/acme/app.git', 'https://github.com/acme/app'],
    ['https://user:token@github.com/acme/app.git', 'https://github.com/acme/app'],
    ['git@gitlab.example.com:team/app.git', 'https://gitlab.example.com/team/app'],
  ])('converts %s', (remote, expected) => {
    expect(RepositoryHelper.toBrowserUrl(remote)).toBe(expected);
  });

  it.each([
    [undefined],
    [''],
    ['   '],
    // eslint-disable-next-line no-script-url
    ['javascript:alert(1)'],
    ['https://github.com/'],
    ['not a url'],
  ])('rejects %p', (remote) => {
    expect(RepositoryHelper.toBrowserUrl(remote)).toBeNull();
  });
});
