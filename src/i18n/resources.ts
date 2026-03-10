import type { Resource } from "i18next";

import enCommon from "../../locales/en/common.json";
import enDesktop from "../../locales/en/desktop.json";
import enExtension from "../../locales/en/extension.json";
import enNative from "../../locales/en/native.json";
import zhCnCommon from "../../locales/zh-CN/common.json";
import zhCnDesktop from "../../locales/zh-CN/desktop.json";
import zhCnExtension from "../../locales/zh-CN/extension.json";
import zhCnNative from "../../locales/zh-CN/native.json";

export const i18nResources = {
  en: {
    common: enCommon,
    desktop: enDesktop,
    extension: enExtension,
    native: enNative,
  },
  "zh-CN": {
    common: zhCnCommon,
    desktop: zhCnDesktop,
    extension: zhCnExtension,
    native: zhCnNative,
  },
} satisfies Resource;
