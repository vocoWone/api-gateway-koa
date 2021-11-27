import cryptoJS from "crypto-js";
import c2k from 'koa-connect';
import {Next, ParameterizedContext} from "koa"
import CSRF from "csrf";
import {IncomingMessage, ServerResponse, ClientRequest} from "http"
import IORedis from "ioredis";
import Router from "koa-router";
import { createProxyMiddleware, Options as HttpProxyOptions} from 'http-proxy-middleware';
import {Response, Request} from 'http-proxy-middleware/dist/types';
import {CTXState} from "./index";

// ref: https://github.com/chimurai/http-proxy-middleware/issues/97
// fix:  Error Cannot set headers after they are sent to the client Error: Cannot set headers after they are sent to the client
const  modifyResponse = require("node-http-proxy-json");

type OnProxyReq = (proxyReq: ClientRequest, req: Request, res: Response, session?: Record<string, unknown>) => void;

type OnProxyRes = (proxyRes: IncomingMessage, req: Request, res: Response, body?: Record<string, unknown>) => void;

type ConnectMiddleware = (req: IncomingMessage, res: ServerResponse, callback: (...args: unknown[]) => void) => void

interface Session {
    sessionId?: string;
    session?: any;
    saveSession?: () => Promise<void>;
}

const CsrfToken = new CSRF();

export const hmacSHA256 = (signString:string,secret:string) => {
    return cryptoJS.HmacSHA256(signString,secret).toString()
}

export const proxy = (context: Omit<HttpProxyOptions, "onProxyRes" | "onProxyReq"> & {onProxyRes?: OnProxyRes, onProxyReq?: OnProxyReq}, options?: HttpProxyOptions) => async (ctx:ParameterizedContext<CTXState, Router.IRouterParamContext<any, {}>, any>, next: Next) => {
    const {onProxyReq, onProxyRes, ...restContext} = context;
    const redis:IORedis.Redis = ctx.state.redis;
    const sidKey: string = ctx.state.sessionOptions?.key || "sid";
    const sid = ctx.cookies.get(sidKey) || "";
    const session = await redis.get(sid)
    const sessionJSON: Record<string, unknown> = session && JSON.parse(session) || {}
    const whitelist = ctx.state.sessionOptions?.whitelist || []

    if(session || whitelist.includes(ctx.path)) {
        const nextProxyReq  = async (proxyReq: ClientRequest, req: Request, res: Response) =>{
             await onProxyReq?.(proxyReq,req, res, sessionJSON);
        }

        const nextProxyRes = async (proxyRes: IncomingMessage, req: Request, res: Response) =>
            modifyResponse(res, proxyRes,  async (body: Record<string, unknown>) => {
                await refleshCsrfTokenCookie(ctx);
                const result = await onProxyRes?.(proxyRes,req, res, body);
                if(result) return result;
                return body
            })

        const executeProxy = () => c2k(createProxyMiddleware({...restContext, onProxyReq: nextProxyReq, onProxyRes: nextProxyRes}, options) as ConnectMiddleware)(ctx, next);
        
        if((ctx.state?.csrfOptions?.whitelist||[]).includes(ctx.path)) {
            return executeProxy()
        } else {
            if(typeof  ctx.request.req.headers["csrf-token"] ==="string") {
                const success = await apiAuthentication(ctx);
                if(success) {
                    return executeProxy();
                } else {
                    ctx.body = { success: false, msg:"csrf-token 不存在" };
                    await next();
                }
            } else {
                    ctx.body = { success: false, msg:"csrf-token 丢失" };
                    await next();
            }
        }
    } else {
        ctx.body = { success: false, msg:"access-token 失效" };
        await next();
    }
} 

// store in csrf-token secret、cookie、redis  
export const saveSession = async (key: string, value: any, ctx: ParameterizedContext<any, Router.IRouterParamContext<any, {}>, any> & Session)=> {
    if(!ctx.session?.secret) {
        const secret = CsrfToken.secretSync();
        ctx.session!.secret = secret;
    }
    ctx.sessionId = key;
    ctx.session!.auth = value;
    ctx.cookies.set("csrf-token", CsrfToken.create(ctx.session!.secret));
    if(ctx?.saveSession)  await ctx.saveSession();
    return ctx.sessionId;
}

export const refleshCsrfTokenCookie = async (ctx: ParameterizedContext<any, Router.IRouterParamContext<any, {}>, any>) => {
    const redis:IORedis.Redis = ctx.state.redis;
    const sidKey: string = ctx.state.sessionOptions.key;
    const sid = ctx.cookies.get(sidKey) || "";
    const session = await redis.get(sid)
    const sessionJSON = session && JSON.parse(session) || {}
    sessionJSON.secret && ctx.cookies.set("csrf-token", CsrfToken.create(sessionJSON.secret));
}


export const apiAuthentication = async (ctx: ParameterizedContext<any, Router.IRouterParamContext<any, {}>, any>) => {
    const redis:IORedis.Redis = ctx.state.redis;
    const sidKey: string = ctx.state.sessionOptions.key;
    const csrfToken = ctx.request.req.headers["csrf-token"];
    const sid = ctx.cookies.get(sidKey) || "";
    const session = await redis.get(sid);
    const sessionJSON = session && JSON.parse(session) || {}
    if(session && csrfToken && typeof csrfToken ==="string" && CsrfToken.verify(sessionJSON.secret, csrfToken)) {
        return true;
    }
    return false;
}

interface Options {
    clientId: string;
    secret: string;
    appid: string;
    lang?: string;
    region?: string;
    accessToken?: string;
    session?: Record<string, any>;
}

export const hightway = (options: Options, proxyReq:ClientRequest ) => {
    const {clientId, secret, session, appid, lang="zh", region="AY"} = options;
    const timestamp = new Date().getTime();
    const accessToken = session?.auth?.access_token as string;
    const sign = hmacSHA256(clientId + accessToken + timestamp, secret).toUpperCase();
    proxyReq.setHeader("sign",sign);
    proxyReq.setHeader("access_token", accessToken);
    proxyReq.setHeader("t",timestamp.toString());
    proxyReq.setHeader("client_id", clientId);
    proxyReq.setHeader("lang", lang);
    proxyReq.setHeader("region", region);
    proxyReq.setHeader("sign_method", "HMAC-SHA256");
    proxyReq.setHeader("x-fe-appid", appid);
}

export const radar = (options: Options, proxyReq: ClientRequest ) => {
    const {clientId, secret, appid, lang="zh", region="AY",accessToken=""} = options;
    const timestamp = new Date().getTime();
    const sign = hmacSHA256(clientId + accessToken + timestamp, secret).toUpperCase();
    proxyReq.setHeader("sign",sign);
    proxyReq.setHeader("client_id", clientId);
    proxyReq.setHeader("sign_method", "HMAC-SHA256");
    proxyReq.setHeader("lang", lang);
    proxyReq.setHeader("region", region);
    proxyReq.setHeader("t",timestamp.toString());
    proxyReq.setHeader("x-fe-appid", appid);
    proxyReq.setHeader("access_token", accessToken);
}