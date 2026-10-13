import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import ExtensionList from './ExtensionList.vue';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('ExtensionList', ExtensionList);
  },
} satisfies Theme;
