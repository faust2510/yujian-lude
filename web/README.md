# 遇见路得 Web 应用区

这是遇见路得挂载在 `/app` 下的 React/Vite 单页应用。项目入口和完整运行说明以根目录 `README.md` 为准。

## 常用命令

```bash
npm install --prefix web
npm run dev --prefix web
npm run lint --prefix web
npm run build --prefix web
```

开发服务会把 `/api` 代理到 `http://localhost:8090`。生产构建输出到根目录 `web-dist`，并由后端挂载到 `/app`。
