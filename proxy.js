var http = require('http');
var util = require('util');
var fs = require('fs');
var net = require('net');

util.log('starting proxy');

var blacklist = [];

fs.watchFile('./blacklist', function (current, previous) {
    updateBlacklist();
});

function updateBlacklist () {

    var fileContent = fs.readFileSync('./blacklist', {encoding: 'utf8'});

    blacklist = fileContent.split('\n')
        .filter(function(rx) { return rx.trim().length; })
        .map(function(rx) { return RegExp(rx.trim()); });

    util.log('blacklist: ' + blacklist);
}

function isDenied(req) {
    for (i in blacklist) {
        if ( blacklist[i].test(req.url) ) {
            return true;
        }
    }

    return false;
}

var httpUserRequest = function (userReq, userRes) {

    if ( isDenied(userReq) ) {
        util.log('denied: ' + userReq.method + ' ' + userReq.url);
        userRes.write('<html><body><h1>access denied</h1></body></html>');
        userRes.end();
        return;
    }

    var options = {
        hostname: userReq.headers['host'],
        path: userReq.url,
        port: 80,
        method: userReq.method,
        headers: userReq.headers
    }

    var proxyRequest = http.request(options, function (proxyRes) {


        proxyRes.on('data', function (chunk) {
            userRes.write(chunk, 'binary');
        });

        proxyRes.on('end', function () {
            userRes.end();
        });

        proxyRes.on('error', function(e) {
            util.error(e);
        });

        userRes.writeHead(proxyRes.statusCode, proxyRes.headers);

    })

    proxyRequest.on('error', function(e) {
        util.error(e);
        userRes.writeHead(500);
        userRes.end('<h1>500 Error</h1>');
    });

    userReq.on('data', function (chunk) {
        proxyRequest.write(chunk, 'binary');
    });

    userReq.on('end', function () {
        proxyRequest.end();
    });

    userReq.on('error', function(e) {
        util.error(e);
        userRes.writeHead(500);
        userRes.end('<h1>500 Error</h1>');
    });

};

var regex_hostport = /^([^:]+)(:([0-9]+))?$/;

function getHostPortFromString( hostString, defaultPort ) {
    var host = hostString;
    var port = defaultPort;

    var result = regex_hostport.exec(hostString);
    if (result != null) {
        host = result[1];
        if (result[2] != null) {
            port = result[3];
        }
    }

    return( {host: host, port: port } );
}

function main() {

    var port = 9001;

    updateBlacklist();

    var server = http.createServer(httpUserRequest).listen(port);

    server.addListener('connect', function (req, socketReq, bodyhead) {

        var url = req.url;

        var httpVersion = req.httpVersion;

        var hostport = getHostPortFromString(url, 443);

        var proxySocket = new net.Socket();

        proxySocket.connect(
            parseInt(hostport.port), hostport.host,
            function () {
                proxySocket.write(bodyhead);

                socketReq.write("HTTP/" + httpVersion + '200 Connection established\r\n\r\n');
            }
        );

        proxySocket.on('data', function (chunk) {
            socketReq.write(chunk);
        });

        proxySocket.on('end', function () {
            socketReq.end();
        });

        socketReq.on('data', function (chunk) {
            proxySocket.write(chunk);
        });

        socketReq.on('end', function () {
            proxySocket.end();
        });

        proxySocket.on('error', function (err) {
            util.error(err);
        });

        socketReq.on('error', function (err) {
            util.error(err);
        });

    });
}

main();

