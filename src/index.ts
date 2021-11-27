/// <reference path="./types/koa-onerror.d.ts" />

import Koa from "koa";
import Router from 'koa-router';
import bodyparser from "koa-bodyparser";
import session, {SessionStore, SessionOptions} from "koa-generic-session";
import redisStore from "koa-redis";
import Redis from "ioredis";
import onerror from "koa-onerror";
import IORedis from "ioredis";

type NextSessionOptions = Pick<SessionOptions, Exclude<keyof SessionOptions,"store">> & {whitelist?: string[]}

export interface Options {
    port?: number | string; // default is 8000
    keys?:string[],
    keepAliveTimeout?: number; // default is 60s
    csrfOptions?: CSRFOptions;
    bodyparserOptions?:bodyparser.Options;
    redisOptions?: Redis.RedisOptions
    sessionOptions? : NextSessionOptions
    onErrorOptions?:ErrorOptions
    onMiddleware:(app: Koa<Koa.DefaultState, Koa.DefaultContext>,router:Router<any, {}>,redis: Redis.Redis)=>void;
}

export interface CTXState {
    redis: IORedis.Redis;
    csrfOptions?: CSRFOptions;
    bodyparserOptions?:bodyparser.Options;
    redisOptions?: Redis.RedisOptions
    sessionOptions? : NextSessionOptions
}

interface CSRFOptions {
    key:string;
    whitelist: string[]
}

interface ErrorOptions {
    accepts?: ()=> boolean;
    all?:(error:Error,ctx: Koa.Context)=>void;
    text?:(error:Error,ctx: Koa.Context)=> void;
    json?:(error:Error,ctx: Koa.Context)=>void;
    html?:(error:Error,ctx: Koa.Context)=>void;
    redirect?:string;
}

export const start = (options: Options) => {
    const { port=8000, keepAliveTimeout=60e3, sessionOptions={}, csrfOptions = {key: "csrf-token", whitelist: []}, keys=[], redisOptions, bodyparserOptions, onMiddleware, onErrorOptions } = options;
    const app = new Koa();

    onerror(app,onErrorOptions);
    const router = new Router();
    const redis = new Redis(redisOptions);
    app.keys = keys;
    app.use(async (ctx,next)=> {
        ctx.state = { redis, sessionOptions, redisOptions, bodyparserOptions, csrfOptions };
        await next();
    })
    app.use(session({
        store: redisStore((redisOptions || {}) as redisStore.RedisOptions) as unknown as SessionStore,
        ...sessionOptions
    }));

    onMiddleware(app, router, redis);

    app.use(router.routes());
    app.use(bodyparser(bodyparserOptions));
    app.listen(Number(port),()=>{
        console.info(`> server start, port: ${port}`)
    }).keepAliveTimeout = keepAliveTimeout;
    // ref: keepAliveTimeout --> https://shuheikagawa.com/blog/2019/04/25/keep-alive-timeout/
   
    process.on("uncaughtException", e => {
        console.info(`uncaughtException: ${e.name} ${e.message} ${e.stack}`);
    });
}