// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://wutpeach.github.io',
	base: '/Ameow',
	integrations: [
		starlight({
			title: 'Ameow',
			description: '常驻桌面的悬浮下载与收集窗口。',
			favicon: '/favicon.svg',
			locales: {
				root: {
					label: '简体中文',
					lang: 'zh-CN',
				},
				en: {
					label: 'English',
					lang: 'en',
				},
			},
			logo: {
				src: './public/logo-mark.svg',
				alt: 'Ameow',
			},
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/Wutpeach/Ameow' }],
			sidebar: [
				{
					label: '入门',
					translations: { en: 'Getting Started' },
					items: ['docs/downloads', 'docs/concepts', 'docs/getting-started', 'docs/faq'],
				},
				{
					label: '桌面端使用',
					translations: { en: 'Desktop' },
					items: [
						'docs/desktop/floating-window',
						'docs/desktop/output-folder',
						'docs/desktop/files-and-folders',
						'docs/desktop/links-and-queue',
						'docs/desktop/settings',
					],
				},
				{
					label: '浏览器扩展',
					translations: { en: 'Browser Extension' },
					items: [
						'docs/browser-extension',
						'docs/extension/install',
						'docs/extension/connection',
						'docs/extension/supported-sites',
						'docs/extension/cookies-and-login',
					],
				},
				{
					label: '高级使用',
					translations: { en: 'Advanced' },
					items: [
						'docs/advanced/quality-and-formats',
						'docs/advanced/ae-compatibility',
						'docs/advanced/download-dependencies',
					],
				},
				{
					label: '故障排查',
					translations: { en: 'Troubleshooting' },
					items: [
						'docs/troubleshooting',
						'docs/troubleshooting/macos-first-run',
						'docs/troubleshooting/extension-disconnected',
						'docs/troubleshooting/error-messages',
						'docs/troubleshooting/download-failures',
						'docs/troubleshooting/missing-files',
					],
				},
				{
					label: '版本记录',
					translations: { en: 'Releases' },
					items: ['docs/releases'],
				},
				{
					label: '开发者指南',
					translations: { en: 'Developer Guide' },
					items: [
						'docs/developer',
						'docs/developer/local-development',
						'docs/developer/environment-variables',
						'docs/developer/testing',
						'docs/developer/docs-and-locales',
					],
				},
			],
			customCss: ['./src/styles/starlight.css'],
		}),
	],
});
