import express from 'express';
import fs from 'node:fs/promises'


// 区分开发环境和生产环境
const isProd = process.env.NODE_ENV === 'production';

// 根路径
const base = process.env.BASE || '/'

// 启动端口
const port = 3000

// 读取客户端模板
const templateHtml = isProd ? await fs.readFile('./dist//index.html', 'utf-8') : "";

// 读取ssr资源
const ssrManifest = isProd ? await fs.readFile('./dist/client/.vite/ssr-manifest.json', undefined) : undefined;


// 创建http服务
const app = express();

let vite

// 如果不是生产环境，启动vite  , 如果不是启动express中间件
if (!isProd) {
    const { createServer } = await import('vite')

    vite = await createServer({
        server: {
            middlewareMode: true
        },
        appType: 'custom',
        base
    })

    app.use(vite.middlewares)
} else {
    const compression = (await import('compression')).default;
    const sirv = (await import('sirv')).default;

    app.use(compression());
    app.use(base, sirv('./dist/client', { extensions: [] }))

}

// 服务端拦截，并且使用占位符去渲染页面
app.use('*', async (req, res) => {
    try {
        const url = req.originalUrl.replace(base, '/')

        let template
        let render

        if (!isProd) {
            // 如果是开发环境
            template = await fs.readFile('./index.html', 'utf-8')
            template = await vite.transformIndexHtml(url, template)
            render = (await vite.ssrLoadModule('/src/entry-server.ts')).render
        } else {
            // 如果是生产
            template = templateHtml;
            render = (await import('./dist/server/entry-server'))
        }

        const rendered = await render(url, ssrManifest);

        // 占位符替换渲染
        const html = template
            .replace(`<!--app-head-->`, rendered.head ?? '')
            .replace(`<!--app-html-->`, rendered.html ?? '')

        res.status(200).set({ 'Content-Type': 'text/html' }).send(html)

    } catch (e) {
        vite?.ssrFixStacktrace(e)
        console.log(e.stack)
        res.status(500).end(e.stack)
    }
})

// 启动服务
app.listen(port, () => {
    console.log(`SSR项目已经启动 http://localhost:${port}`)
})