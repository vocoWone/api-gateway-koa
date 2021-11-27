# api网关
- 基于koa，集成代理、cookie/session/redis存储、csrf、异常统一处理

## 什么是api网关
- 从前端看，网关可以接口聚合与协议转换。
- 从后端看，网关可以集成鉴权以及过滤非法请求。

## 鉴权
- 网关鉴权操作是判断客户端cookie
- 后端鉴权是网关生成的签名与后端生成的签名做对比

## 异常处理
- 根据api请求的request headers->accept字段判断类型。若存在, accepts函数返回true则寻找该类型的回调函数; 若不存在, accepts函数返回false并不处理当前错误。

## session存储
- 客户端存cookie，服务端存redis中，session作为传输介质
- redis服务使用库：ioredis
- cookie、session、redis联动使用库：koa-generic-session、koa-redis

## 路由代理
- http-proxy-middleware

## 协议转换
- 根据业务而定

## 签名算法
- 根据业务而定

## 安全
- csrf：使用csrf生成token，服务端存一份secret，每次进入网站时重新获取token，并在调用接口时带上这个token在网关验证。
- 熔断：TODO
- 监控报警: TODO

## 日志收集/流量管控/埋点
TODO

## CORS
TODO

## debug
- docker redis(medis), postman
