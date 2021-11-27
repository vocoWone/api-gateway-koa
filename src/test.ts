import{start, Options} from "./index";
import {proxy, saveSession, radar, hightway} from "./kit";
import axios from 'axios';

const clientId = "xxx";
const secret = "xxx";
const apiURL = "https://xxx.com";
const keys = ['keys', 'keykeys'];
const sidKey = "i-sid";
const csrfOptions = {
    key:"csrf-token",
    whitelist: ["/health", "/api/token", "/api/login", "/api/get-device-count"]
};

const sidCookieOption =  {
    path: '/',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, //one day in ms
    // overwrite: true,
    signed: false
};

const redisOptions = {
    port: 6379,
    host: "localhost",
};

const sessionOptions = {
    prefix:"",
    key: sidKey,// The client stores the corresponding cookie
    rolling: true, // always reset the cookie and sessions
    ttl:24 * 60 * 60 * 1000, // redis survival time
    // full options: https://github.com/pillarjs/cookies#cookiesset-name--value---options--
    cookie: sidCookieOption,
    whitelist: ["/health", "/api/token", "/api/login", "/api/get-device-count"]
};

const options: Options = {
    port:3000,
    keys,
    csrfOptions,
    redisOptions,
    sessionOptions,
    onErrorOptions:{
        accepts() {
            return this.accepts("json", 'html', 'text')
        },
        json(error) {
            console.error(error)
        },
        html(error) {
            console.error(error)
        },
        text(error) {
            console.error(error)
        },
        redirect: "/health"
    },
    onMiddleware:(_app,router) => {
        router.all('/health', async(ctx, next) => {
            const { res } = ctx;
            res.writeHead(200, { 'Content-type': 'text/html' });
            res.end("ok");
            await next();
        })

        router.all("/api/token", proxy({
            proxyTimeout: 10000,
            timeout: 10000,
            target: apiURL,
            changeOrigin: true,
            onProxyReq: (proxyReq) => {
                proxyReq.method = "GET";
                radar({clientId, secret, appid: "estate-data"}, proxyReq);
            },
            pathRewrite: (path) => path.replace("/api/token", "/v1.0/token"),
        }));

        router.all("/api/login", async function (ctx, next) {
            const tokenResponse = await axios.request({
                url:"/api/token",
                baseURL:"http://localhost:3000/",
                method:"GET",
                params:{ grant_type: 1 }
            })
            if(tokenResponse.data.success) {
                return await proxy({
                    proxyTimeout: 10000,
                    timeout: 10000,
                    target: apiURL,
                    changeOrigin: true,
                    onProxyReq: (proxyReq) => {
                        proxyReq.method = "POST";
                        radar({clientId, secret, appid: "estate-data"}, proxyReq);
                    },
                    onProxyRes: async (_proxyRes, _req, _res, body?: Record<string, unknown>) => {
                        if(body?.success){
                            const sessionId = await saveSession(sidKey, body?.result, ctx)                       
                            return {success:true,[sidKey]: sessionId};
                        } else {
                            return body;
                        }
                    },
                    pathRewrite: (path) => path.replace("/api/login", "/v1.0/industry/user/verify-login"),
                })(ctx, next);
            } else {
                ctx.body = tokenResponse.data
            }
        });

        router.all("/api/get-device-count", proxy({
            proxyTimeout: 10000,
            timeout: 10000,
            target: apiURL,
            changeOrigin: true,
            onProxyReq: (proxyReq, _req, _res, session?: Record<string, any>) => hightway({session,clientId, secret, appid: "estate-data"}, proxyReq),
            pathRewrite: (path) => path.replace("/api/get-device-count", "/v1.0/community/steward/device/count/get"),
        }));
    }
}

start(options);