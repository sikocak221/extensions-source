import { defineConfig } from 'vitepress';

const repo = 'https://github.com/sikocak221/extensions-source';

// The site is served from https://<owner>.github.io/extensions-source/, next to index.json and the archives
// (scripts/build-site.mjs copies the build into public/). `docs/repository.md` and `docs/extensions.md` are written
// by that script from the repository it just built.
const base = process.env['DOCS_BASE'] ?? '/extensions-source/';

export default defineConfig({
  title: 'Extensions Source',
  description: 'A signed extension repository: source code only.',
  lang: 'en-US',
  base,
  head: [['link', { rel: 'icon', type: 'image/png', href: `${base}favicon.png` }]],
  cleanUrls: true,
  lastUpdated: false,
  // The extension list is a Vue component fed by a generated JSON file; the page itself has no body text to index.
  themeConfig: {
    logo: '/logo.png',
    nav: [
      { text: 'Add the repository', link: '/repository' },
      { text: 'Extensions', link: '/extensions' },
      { text: 'FAQ', link: '/faq' },
    ],
    sidebar: [
      {
        text: 'Use it',
        items: [
          { text: 'Add the repository', link: '/repository' },
          { text: 'Extensions', link: '/extensions' },
          { text: 'FAQ and disclaimer', link: '/faq' },
          { text: 'Copyright and takedown', link: '/takedown' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: repo }],
    editLink: { pattern: `${repo}/edit/main/docs/:path`, text: 'Edit this page on GitHub' },
    search: { provider: 'local' },
    footer: {
      message:
        'Source code only: this repository does not host, store or distribute any content, and is independent of any app and of every third-party site. Released under the MIT license. <a href="takedown">Copyright and takedown requests</a>.',
    },
  },
});
