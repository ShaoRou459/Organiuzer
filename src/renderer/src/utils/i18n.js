export const translations = {
  en: {
    settings: {
      title: "Settings",
      tabs: {
        ai: "AI Configuration",
        general: "General"
      },
      ai: {
        provider: "AI Provider",
        providerOptions: {
          openai: "OpenAI",
          custom: "Custom / Local (OpenAI Compatible)"
        },
        apiKey: "API Key",
        apiKeyHelper: "Your OpenAI API Key or equivalent.",
        model: "Model Name",
        modelHelper: "e.g., gpt-4o, gpt-3.5-turbo, or local model name",
        baseUrl: "Base URL (Optional)",
        baseUrlHelperCustom: "Required for local LLMs (Ollama, LM Studio, etc.)",
        baseUrlHelperDefault: "Leave empty to use default OpenAI endpoint, or enter a custom URL"
      },
      general: {
        language: "Language",
        theme: "Theme",
        themeOptions: {
          dark: "Dark",
          light: "Light"
        },
        debugMode: "Debug Mode",
        debugModeHelper: "Enables detailed logging and shows raw AI responses in the console."
      },
      actions: {
        cancel: "Cancel",
        save: "Save Changes"
      }
    },
    home: {
      greeting: {
        morning: "Good morning",
        afternoon: "Good afternoon",
        evening: "Good evening",
        night: "Good night"
      },
      tagline: "Declutter • Organize • Automate",
      filesOrganized: "Files Organized",
      start: "Start",
      spaceProcessed: "Space Processed",
      timeSaved: "Time Saved",
      activityOverview: "Activity Overview",
      noActivityChart: "No activity recorded yet",
      activeModel: "Active Model",
      configureApp: "Configure App",
      recentActivity: "Recent Activity",
      noActivityList: "No activity yet"
    }
  },
  zh: {
    settings: {
      title: "设置",
      tabs: {
        ai: "AI 配置",
        general: "常规"
      },
      ai: {
        provider: "AI 提供商",
        providerOptions: {
          openai: "OpenAI",
          custom: "自定义 / 本地 (兼容 OpenAI)"
        },
        apiKey: "API 密钥",
        apiKeyHelper: "您的 OpenAI API 密钥或同等密钥。",
        model: "模型名称",
        modelHelper: "例如：gpt-4o, gpt-3.5-turbo, 或本地模型名称",
        baseUrl: "基础 URL (可选)",
        baseUrlHelperCustom: "本地 LLM (Ollama, LM Studio 等) 必需",
        baseUrlHelperDefault: "留空以使用默认 OpenAI 端点，或输入自定义 URL"
      },
      general: {
        language: "语言",
        theme: "主题",
        themeOptions: {
          dark: "深色",
          light: "浅色"
        },
        debugMode: "调试模式",
        debugModeHelper: "启用详细日志并在控制台中显示原始 AI 响应。"
      },
      actions: {
        cancel: "取消",
        save: "保存更改"
      }
    },
    home: {
      greeting: {
        morning: "早上好",
        afternoon: "下午好",
        evening: "晚上好",
        night: "晚安"
      },
      tagline: "整理 • 归类 • 自动化",
      filesOrganized: "已整理文件",
      start: "开始",
      spaceProcessed: "已处理空间",
      timeSaved: "节省时间",
      activityOverview: "活动概览",
      noActivityChart: "暂无活动记录",
      activeModel: "当前模型",
      configureApp: "配置应用",
      recentActivity: "最近活动",
      noActivityList: "暂无活动"
    }
  }
};
