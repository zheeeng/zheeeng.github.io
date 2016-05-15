---
title: 跨域详解：从微信 WGS–84 坐标转换百度 BD–09 坐标说起（上）
tags: [微信开发, 签名算法, OAtuh, 跨域, PHP]
description: 使用第三方 API 服务时常需要解决跨域问题，文章分上下两篇，分别讲解微信签名算法与跨域相关知识，希望对不论是有微信开发需求的同学，还是单纯想了解跨域实现及使用的同学都能有所帮助。
---

使用第三方 API 服务时常需要解决跨域问题，几天前接到为本以为完工的加油站 LBS 项目开发微信公众平台服务页面的任务，其中一步需要将微信 WGS–84 坐标转换成百度 BD–09 坐标，WGS–84 坐标在 Web 应用中通过微信客户端拿到，转换 BD–09 坐标则需要向百度的接口发送输入坐标，此时发生跨域请求。正可籍此深耕一下写篇跨域文章，从制造问题——铺垫微信 JS-SDK 开发的相关内容、获取待转换的 WGS–84 坐标，到分析问题并解决——解构跨域请求的多种方式并完成坐标转换，构造可再现的情景展开讲解跨域。文章分上下两篇，分别讲解微信签名算法与跨域相关知识，希望对不论是有微信开发需求的同学，还是单纯想了解跨域实现及使用的同学都能有所帮助。

# 地理坐标

在之前项目中使用了百度的地图服务，存入数据库中的位置坐标为百度 BD–09 坐标，此时在手机微信的框架下使用地理信息接口可以拿到的坐标为 WGS–84 坐标或火星坐标 GCJ–02坐标，与百度的坐标差了好几百米，数据库信息对不上，便产生了坐标转换的需求。

1. WGS–84 为世界标准地理坐标系统，世界主流地图服务都在使用这个坐标系。它以一系列参数将地球建模为类球体，再将地表上的点投影到该球面上，以经纬度为坐标表示每一个点的位置。
2. GCJ–02 为中国国家测绘局基于 WGS–84 加密制订的坐标系统，一定程度作用于用国土安全。国家严禁没有测绘资质的团队对中国国土进行测绘，中国国家测绘局则对拿到的 WGS–84 坐标使用保密的偏移算法，加入随机偏差得到 GCJ–02 坐标，并要求国内出版的各种地图系统（包括电子形式），必须至少采用 GCJ–02 对地理位置进行首次加密，因而 GPS 芯片探测到的坐标位置与 GCJ–02 街道地图上的 [地理位置标记(Geotagging)][Geotagging] 无法对齐。通常使用一些国外的地图服务出现地理位置偏移的原因也在于此。
3. BD–09 则是百度地图在 GCJ–02 基础上再加密的坐标系统。

    > 国际经纬度坐标标准为WGS–84,国内必须至少使用国测局制定的GCJ–02,对地理位置进行首次加密。**百度坐标在此基础上，进行了BD–09二次加密措施,更加保护了个人隐私。**百度对外接口的坐标系并不是GPS采集的真实经纬度，需要通过坐标转换接口进行转换。
    *[百度坐标为何有偏移？][BD–09 Shift]*

地图坐标加密使用非线性加密，通常无法实现后者到先者的逆向解密，往往只能靠坐标系统间的映射表作回归测试计算被加密坐标的输入值。使用百度地图时用到的 BD–09 坐标一是直接由百度地图服务直接提供，一是由 WGS–84 或 GCJ–02 坐标经由百度 API 转换接口转换得到。使用前者的方式，存储下的 LBS 服务地理信息必然只能是 BD–09 坐标，想要改换其它地图服务时只能放弃已有的地理数据，或是尝试网上众多的逆向转换工具却还不能保证精度，由此，你陷入了深深的百度地图依赖。使用后者的方式，存储地理信息时固然可以只用 WGS–84 或 GCJ–02 坐标，但使用百度地图服务时，每次都需要进行坐标转换，又增加了不必要的网络、时间、计算开销。总而言之，入了百度的坑，出来不易。

# 获取手机微信地理信息

在开发手机微信 HTML5 应用中经常需要调用微信的接口服务，如分享、相册、地理信息、支付等功能，必然少不了与微信 JS-SDK 打交道，在应用中获取手机微信地理信息前就先要进行微信 JS-SDK 相关配置。详细步骤可以参考 [官方配置文档][Wechat JS-SDK]。其中

其中会用到的一系列凭据及必要准备：

1. AppID(应用ID)：微信公众平台 > 开发 > 基本配置
2. AppSecret(应用密钥)：微信公众平台 > 开发 > 基本配置
3. JS接口安全域名：微信公众平台 > 设置 > 公众号设置，加入将会调用 JS-SDK API 的 Web App 的域名。这个域名要求是有备案并申核通过的一级或一级以上的域名，不支持 IP 地址，为了方便调试，一个窍门是修改本机 hosts 文件映射到填入的域名，如果实际的域名暂时无法填入可以先填写 "baidu.com" ，一个月有三次修改或添加安全域名的机会，[官方文档][JS-SDK appendix-5] 允许在域名中加上端口号，然而填入时不被允许，提示不支持设置该域名，在微信官方订下文档或真正实现端口设置前本机调试服务一律使用 80 端口。

整个流程会涉及到的角色：
1. 在手机 Web APP 中使用微信 JS-SDK 的 Web App **前端页面**
2. 计算验证签名并供应设置参数的**应用服务器**
3. 提供 `access_token`、提供 `jsapi_ticket`、验证签名、提供 API 服务的各**微信服务器**，统一使用**“微信服务器”**这个角色名。
4. 提供 BD–09 坐标转换 API 服务的**百度服务器**。

## 微信 JS-SDK 参数配置

微信为了认证调用其 API 的应用身份，并记录应用调用情况，要求使用者在使用 JS-SDK 的页面引入微信提供的 JS 文件，并在页面 `<script></script>` 标签中注入配置信息：

```js
wx.config({
    debug: true, // 开启调试模式,调用的所有api的返回值会在客户端alert出来，若要查看传入的参数，可以在pc端打开，参数信息会通过log打出，仅在pc端时才会打印。
    appId: '', // 必填，公众号的唯一标识
    timestamp: , // 必填，生成签名的时间戳
    nonceStr: '', // 必填，生成签名的随机串
    signature: '',// 必填，签名，见附录1
    jsApiList: [] // 必填，需要使用的JS接口列表，所有JS接口列表见附录2
});
```

配置中的 `appId`，`timestamp`，`nonceStr`，`signature` 是权限签名验证的关键参数，在前端页面中使用 Ajax 向你的应用服务器后台发送参数请求，再获取到的参数注入 wx.config(configuration)。 配置齐全的 wx.config(configuration) 在运行中会将这四个参数及 debug 开关信息、 API 调用列表发送到微信服务器进行签名验证。如果通过，触发 wx.ready(callback) 便可在回调中使用 `jsApiList` 中填入的微信 API 服务。

## 微信 JS-SDK 权限签名算法

先看一下微信官方给出的验证签名生成规则：

> 参与签名的字段包括 `noncestr`（随机字符串）, 有效的 `jsapi_ticket`, `timestamp`（时间戳）, `url`（当前网页的URL，不包含#及其后面部分）。对所有待签名参数按照字段名的ASCII 码从小到大排序（字典序）后，使用URL键值对的格式（即`key1=value1&key2=value2…`）拼接成字符串 `string1`。这里需要注意的是所有参数名均为小写字符。对 `string1` 作 sha1 加密，字段名和字段值都采用原始值，不进行 URL  转义。

意思很好理解，即我们的应用服务器使用 `noncestr`，`jsapi_ticket`，`timestamp` 及 `url` 拼接成字符串`string1`—`jsapi_ticket=?&noncestr=?&timestamp=?&url=?`，然后使用 sha1 算法对 `string1` 进行加密得到用于微信应用身份验证的 `signature`。这其实就是 OAuth 使用的签名生成算法，用数字签名表示接口调用资质，采用两头各自生成签名再通信比对的方法进行验证，这部分有篇比较好的文章，[Beginner’s Guide to OAuth – Part III : Security Architecture][OAuth: Security Architecture] 值得一读。

回到生成规则中来：

1. `noncestr` 和 `timestamp` 在服务器端分别由随机字符串生成方法与当前时间戳获取方法得到；
2. `jsapi_ticket` 作为应用服务器与微信签名验证服务器的约定，向微信服务器索要得到，只保存在应用后台服务器与微信服务器的数据库中；
3. `url` 为将要使用微信 API 接口的前端页面的 URL，在微信公众号的功能设置中要将 `url` 的域名提前加入 `JS接口安全域名`。`url` 不包括 "#" 符号后面锚信息，但包括 URL 中 "?" 符号后连接的查询语句，当页面被分享后会被添加小尾巴 "from=XXX" 或 "referrer"，也就是说 `url` 并不固定，因此应当在 API 调用页面使用 Ajax 向应用服务器发送参数请求，应用服务器收到请求解析出包含查询语句的源 URL 加入加密字符串以保证和微信服务器验证使用的加密字符串一致；
4. 与此同时，应用服务哭器还要把开发者在公众平台系统设置中申请到的 `appId` 一并发送给前端页面。

前端页面收到应用服务器对 `appId`，`timestamp`，`nonceStr`，`signature` 的响应后立即执行 wx.config(configuration) ，向微信服务器提交这四个参数。微信服务器使用拿到的 `appId` 与 `timestamp` 调出存储在自身服务器上当前有效的 `jsapi_ticket`，再加上拿到的 `nonceStr`，`timestamp`，以相同的方法拼接字符串并进行 sha1 加密，将结果与 `signature` 对比就可以完成签名验证。

为了防止签名被其它人使用，微信服务器只允许每个签名被验证一次，其它人就无法再次使用应用服务器生成的签名。因此在签名算法的设计中加入了 `noncestr` 防止产生重复签名。一般来说如果应用只有一台服务器，产生的 `timestamp` 也能达到 `noncestr` 防止重复的效果，但当应用扩展到多台服务器时，由于各服务器的时钟可能不同步，处理大量请求时就有可能有两个服务器生成相同的 `timestamp`，因此必须使用 `noncestr`。根据微信 JS-SDK，只有通过 `access_token` 才能调取一个暂定有效期为 7200 秒的 `jsapi_ticket`，同样的，`access_token` 的有效期也暂定为 7200 秒，`access_token` 与 `jsapi_ticket` 都有调取次数上限，得到后应把他们存储应用服务器上，这也省去了每次向微信接口发起调用的时间。

`jsapi_ticket`：

> `jsapi_ticket` 是公众号用于调用微信JS接口的临时票据。正常情况下， `jsapi_ticket` 的有效期为7200秒，通过 `access_token` 来获取。由于获取 `jsapi_ticket` 的 api 调用次数非常有限，频繁刷新 `jsapi_ticket` 会导致 api 调用受限，影响自身业务，开发者必须在自己的服务全局缓存 `jsapi_ticket`。

`access_token`：

> `access_token` 是公众号的全局唯一票据，公众号调用各接口时都需使用 `access_token`。开发者需要进行妥善保存。`access_token` 的存储至少要保留512个字符空间。`access_token` 的有效期目前为2个小时，需定时刷新，重复获取将导致上次获取的 `access_token` 失效。

`access_token` 由应用服务器获取并存储，获取需要向微信指定的接口使用 https 协议发送 `AppId` 和 `AppSecret` （微信公众平台官网-开发者中心页中取得）验证取用资质，而存储 `access_token` 的理想方式是使用应用服务器的 cache。cache 天然提供带过期验证的键值对存储方式，一旦旧的 `access_token` 过期，重新获取即可，而在有效期内使用 cache 中的 `access_token` 可以大幅降低向微信服务获取 `access_token` 的频率。 同样地，由应用服务器发送 `access_token` 以获取并存储 `jsapi_ticket`，至此拿到生成 `signature` 的所有参数。

### 算法图示

```
+----------------------------+         +------------------+                    +------------------------------+
|  My server                 |         | My App           |  8. Grant api auth | Wechat server                |
|                            |         |                  | <------------------+                              |
|       +--------------+  1. Req paras |                  |      if verified   |   +---------------+          |
|  +----+     url      | <---+---------+                  |                 +----> |      url      +-----+    |
|  |    +--------------+     |         |                  |                 |  |   +---------------+     |    |
|  | 2. Gen signature        |         |                  |                 |  |     7. Verify sig       |    |
|  |    +--------------+ 3. Resp paras |   +-----------+  |                 |  |   +---------------+ 6. Gen sig
|  +--> |  signature   +--------+   +----> | signature +-----+              +----> |   singnature  | <---+    |
|  |    +--------------+     |  |   |  |   +-----------+  |  |              |  |   +---------------+     |    |
|  |                         |  |   |  |                  |  |              |  |                         |    |
|  |    +--------------+     |  |   |  |   +-----------+  |  |              |  |   +---------------+     |    |
|  +----+  timestamp   +--------+   +----> | timestamp +-----+              +----> |   timestamp   +-----+    |
|  |    +--------------+     |  |   |  |   +-----------+  |  |4. wx.confg() |  |   +---------------+     |    |
|  |                         |  +---+  |                  |  +------------ -+  |                         |    |
|  |    +--------------+     |  |   |  |   +-----------+  |  | Send paras   |  |   +---------------+     |    |
|  +----+   noncestr   +--------+   +----> | noncestr  +-----+              +----> |   noncestre   +-----+    |
|  |    +--------------+     |  |   |  |   +-----------+  |  |              |  |   +---------------+     +    |
|  |                         |  |   |  |                  |  |              | 5. Find jsapi_ticket with appId |
|  |    +--------------+     |  |   |  |   +-----------+  |  |              |  |   +------------------+  +    |
|  | +--+              +--------+   +----> |  appId    +-----+              +----> |     ID Pool      |  |    |
|  | |  |    appId     |     |         |   +-----------+  |                    |   | +--------------+ |  |    |
|  | |  |              | <-+ |         +------------------+                 +--------+    appId     | |  |    |
|  | |  +--------------+   | |        a. Send appId and secret from ID pool |  |   | +--------------+ |  |    |
|  | +--+    secret    | <-+------------------------------------------------+--------+    secret    | |  |    |
|  | |  +--------------+ b. Request generating access_token from ID Pool       |   | +--------------+ |  |    |
|  | +---------------------------------------------------------------------------> | |              | |  |    |
|  |    +--------------+     |              c. Response generated access_token |   | | access_token | |  |    |
|  |    |              | <-----------------------------------------------------------+              | |  |    |
|  |    | access_token |    d. Request generating jsapi_ticket                 |   | +--------------+ |  |    |
|  |    |              +---------------------------------------------------------> | |              | |  |    |
|  |    +--------------+     |                                                 |   | | jsapi_ticket | |  |    |
|  |    +--------------+     |              e. Response generated jsapi_ticket |   | |              +----+    |
|  +----+ jsapi_ticket | <-----------------------------------------------------------+              | |       |
|       +--------------+     |                                                 |   | +--------------+ |       |
|                            |                                                 |   |                  |       |
|                            |                                                 |   +------------------+       |
|                            |                                                 |                              |
+----------------------------+                                                 +------------------------------+
```

# 应用服务器的 PHP 实现

## 相关接口

1. `access_token` 获取接口：

    ```
    http请求方式: GET
    https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=APPID&secret=APPSECRET
    ```

    期望接收到的 JSON 数据为：

    ```json
    {"access_token":"ACCESS_TOKEN","expires_in":7200}
    ```

    发生错误时收到的 JSON 数据为：

    ```json
    {"errcode":40013,"errmsg":"invalid appid"}
    ```

    错误返回码见: [全局返回码说明][Return code]

    开发者可以在 [微信公众平台接口调试工具][MP debug tool] 中测试 `access_token`，也可以测试其它接口调用。

2. `jsapi_ticket` 获取接口：

    ```
    http请求方式: GET
    https://api.weixin.qq.com/cgi-bin/ticket/getticket?access_token=ACCESS_TOKEN&type=jsapi
    ```

    期望接收到的 JSON 数据为：

    ```json
    {
    "errcode":0,
    "errmsg":"ok",
    "ticket":"bxLdikRXVbTPdHSM05e5u5sUoXNKd8-41ZO3MhKoyN5OfkWITDGgnr2fwJ0m9E8NYzWKVZvdVtaUgWvsdshFKA",
    "expires_in":7200
    }
    ```

## PHP 实现代码

服务器为 wx.config 提供参数，示例代码如下：

```php
<?php
/**
 * Reponse the request for wechat JS-SDK config parameters:
 *    - appId
 *    - timestamp
 *    - nonceStr
 *    - signature
 *    which are encoded to a stringfied JSON.
 *
 * @author      Zheeeng
 */

require_once('Cache.class.php');

/* Collection of parameters which are used for fetch access_token && jsapi_ticket */
$app_id = 'wx9000000000000000';
$app_scret = '98f00000000000000000000000000000';
$grant_type = 'client_credential';
$access_token_url = 'https://api.weixin.qq.com/cgi-bin/token';
$ticket_url = 'https://api.weixin.qq.com/cgi-bin/ticket/getticket';
$ticket_type = 'jsapi';

/**
 * Curl http with GET method
 *
 * @param       string $url     Target url
 * @return      string $res     Url content
 */
function httpGet($url)
{
  $curl = curl_init();

  curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($curl, CURLOPT_TIMEOUT, 500);
  curl_setopt($curl, CURLOPT_URL, $url);

  $res = curl_exec($curl);

  curl_close($curl);
  return $res;
}

/**
 * Generate a nonce string
 *
 * @param       string $length  Length of noncestr
 * @return      string $str     noncestr
 */
function generate_noncestr($length = 16)
{
    $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    $str = "";

    for ($i = 0; $i < $length; $i++) {
        $str .= substr($chars, mt_rand(0, strlen($chars) - 1), 1);
    }

    return $str;
}

/**
 * retrieve access_token,
 *    - if it exist return access_token,
 *    - if not, fetch && store it then return it.
 *
 * @param       null
 * @return      string $str     access_token
 */
function get_access_token()
{
    global $access_token_url, $grant_type, $app_id, $app_scret;

    $token = null;

    if (Cache::has('access_token')) {
        $token = Cache::get('access_token');
    } else {
        $token_uri = "$access_token_url?grant_type=$grant_type&appid=$app_id&secret=$app_scret";
        $token_array = json_decode(httpGet($token_uri), true);

        if (isset($token_array['access_token'])) {
           Cache::set('access_token', $token_array['access_token'], $token_array['expires_in']);
           $token = $token_array['access_token'];
        } elseif (isset($token_array['errcode'])) {
            # code to log errcode and errmsg
            $token = null;
        } else {
            # code to process unknow response
            $token = null;
        }
    }
    return $token;
}

/**
 * retrive jsapi_ticket,
 *    - if it exist return jsapi_ticket,
 *    - if not, after retrieving access_token, fetch && store jsapi_ticket and then return it.
 *
 * @param       null
 * @return      string $str     access_token
 */
function get_jsapi_ticket()
{
    global $ticket_url, $ticket_type;

    $ticket = null;
    $acces_token = null;

    if (Cache::has('jsapi_ticket')) {
        $ticket = Cache::get('jsapi_ticket');
    } else {
        $acces_token = get_access_token();
        $ticket_uri = "$ticket_url?access_token=$acces_token&type=$ticket_type";
        $ticket_array = json_decode(httpGet($ticket_uri), true);

        if ( $ticket_array['errcode'] === 0 && isset($ticket_array['ticket'])) {
            Cache::set('jsapi_ticket', $ticket_array['ticket'], $ticket_array['expires_in']);
            $ticket = $ticket_array['ticket'];
        } elseif (isset($ticket_array['errcode'])) {
            # code to log errcode and errmsg
            $ticket = null;
        } else {
            # code to process unknow response
            $ticket = null;
        }
    }

    return $ticket;
}

/**
 * Generate signature && echo the stringfied JSON containing the parameters for wx.config()
 */
if ($_SERVER['REQUEST_METHOD'] === "GET") {
    $timestamp = time();
    $noncestr = generate_noncestr();
    $ticket = get_jsapi_ticket();
    $url = $_SERVER["HTTP_REFERER"];
    // You cloud also sort these para keys in dictionary order
    $string = "jsapi_ticket=$ticket&noncestr=$noncestr&timestamp=$timestamp&url=$url";
    $signature = sha1($string);
    $array = ['appId' => $app_id, 'timestamp' => $timestamp, 'nonceStr' => $noncestr, 'signature' => $signature];
    echo json_encode($array);
}
```

其中 `$app_id` 与 `$app_secret` 替换为应用在微信上申请到的 ID 与密钥，可以在 [微信 Web 开发者工具][MP web dev tool] 测试前端页面拿到的参数是否能通过服务器验证，期望的 JS-SDK config 在 控制台的输出为:

    {"errMsg":"config:ok"}

如果出现错误尝试排查: [常见错误及解决方法][JS-SDK appendix-5]

**注意：** 如果项目对安全性有更高的要求，服务器还可以加入对发起参数请求的 url 的域名检测，频率检测，在请求微信服务器上的数据时对其 IP 检测（参考 [获取微信服务器IP地址][Wechat IP list]）等等，这些扩展此处就不赘言了。

每次获取 `access_token` 与 `jsapi_ticket` 建议使用 cache 缓存，这里提供一个使用写入文件模拟 cache 系统的 Cache 类以供测试，实际项目中学习使用 Redis 或者 Memcached 的缓存系统会大有裨益。

```php
<?php
/**
 * Use a JSON file to simulate Cache system
 *
 * @package     Cache.class.php
 * @category    Utility
 * @author      Zheeeng
 */
class Cache
{
    private static $cacheFile = 'cache.json';
    private static $cachedArray;

    public static function __callStatic($method, $args)
    {
        if( method_exists(__CLASS__, $method) ) {
            self::$cachedArray = file_exists(self::$cacheFile) ? json_decode(file_get_contents(self::$cacheFile), true) : array();
            return call_user_func_array(__CLASS__ . '::' . $method, $args);
        }
    }

    protected static function has($key)
    {
        return isset(self::$cachedArray[$key]) &&  time() < (self::$cachedArray[$key]["time"] + self::$cachedArray[$key]["expire"]);
    }

    protected static function set($key, $value, $expire = 0)
    {
        self::$cachedArray[$key]["value"] = $value;
        self::$cachedArray[$key]["expire"] = $expire;
        self::$cachedArray[$key]["time"] = time();
        file_put_contents(self::$cacheFile, json_encode(self::$cachedArray));
    }

    protected static function get($key)
    {
        if (self::has($key)) {
            return self::$cachedArray[$key]["value"];
        } else {
            return null;
        }
    }

    /**
     * More function to be added:
     *    - clean: cleanup expired entries
     *    - delete: delete cache entry
     *    - erase: erase whole chache entires
     *    - expiration: retrive entry's expiration
     *    - isExpired: check whether an entry expired
     *    - carbon: renew entry's expiration
     *    - ...
     */
}
```

至此，应用服务器可以为前端页面提供 wx.confg(configuration) 需要的所有参数了。

# 百度坐标转换 API

配置完成后在微信 wx.ready(callback) 的回调中加入坐标转换的代码是我们的最终目的，其中必要用到是百度坐标转换 API，它的使用比较简单，分为两步：

1. [获取密钥][Baidu AK]: 启用坐标转换 API 服务，应用类型设置为浏览器端并把调用页面的域名加入 Referer 白名单可一定程度上防止第三方调用;
2. 调用 API 服务:

        http://api.map.baidu.com/geoconv/v1/?coords=LONGITUDE1,LATITUDE1;LONGITUDE2,LATITUDE2&from=1&to=5&ak=BAIDUAK

    关于 API 中的参数说明，返回值说明，状态码说明，见 [百度· Web 服务 API][BD–09 convertion API]

然而在前端页面直接使用这个 API 时控制台会遇到禁止从本源发起的访问：

```
XMLHttpRequest cannot load http://api.map.baidu.com/geoconv/v1/?from=1&to=5&ak=BAIDUAK. No 'Access-Control-Allow-Origin' header is present on the requested resource. Origin 'http://ORIGIN' is therefore not allowed access.
```

改用应用类型为服务端的 AK 借助应用服务器作中转是一个解决方案，它不用面对浏览器上的跨域问题，但缺点是增加了前端页面到应用服务器的一个网络来回，直面跨域问题是接下来的重头戏。

*跨域详解：从微信 WGS–84 坐标转换百度 BD–09 坐标说起（上）完*

[Geotagging]: https://en.wikipedia.org/wiki/Geotagging

[BD–09 Shift]: http://developer.baidu.com/map/question.htm#qa0023

[Wechat JS-SDK]: https://mp.weixin.qq.com/wiki/7/aaa137b55fb2e0456bf8dd9148dd613f.html

[JS-SDK appendix-5]: https://mp.weixin.qq.com/wiki/7/aaa137b55fb2e0456bf8dd9148dd613f.html#.E9.99.84.E5.BD.955-.E5.B8.B8.E8.A7.81.E9.94.99.E8.AF.AF.E5.8F.8A.E8.A7.A3.E5.86.B3.E6.96.B9.E6.B3.95

[OAuth: Security Architecture]: https://hueniverse.com/2008/10/03/beginners-guide-to-oauth-part-iii-security-architecture

[Return code]: https://mp.weixin.qq.com/wiki/17/fa4e1434e57290788bde25603fa2fcbd.html

[MP debug tool]: http://mp.weixin.qq.com/debug

[MP web dev tool]: https://mp.weixin.qq.com/wiki?t=resource/res_main&id=mp1455784140&token=&lang=zh_CN

[Wechat IP list]: https://mp.weixin.qq.com/wiki/0/2ad4b6bfd29f30f71d39616c2a0fcedc.html

[Baidu AK]: http://lbsyun.baidu.com/apiconsole/key?application=key

[BD–09 convertion API]: http://lbsyun.baidu.com/index.php?title=webapi/guide/changeposition


