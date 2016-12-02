// Copyright 2015-2016, Google, Inc.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions andheroku login
// limitations under the License.

'use strict';

const path = require('path');
const express = require('express');
const session = require('express-session');
const MemcachedStore = require('connect-memcached')(session);
const passport = require('passport');
const config = require('./config');

const oauth2 = require('./lib/oauth2');

const app = express();
var http = require('https').Server(app);
var io = require('socket.io')(http);


app.disable('etag');
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.set('trust proxy', true);

// [START session]
// Configure the session and session storage.
const sessionConfig = {
    resave: false,
    saveUninitialized: false,
    secret: config.get('SECRET'),
    signed: true
};

// In production use the App Engine Memcache instance to store session data,
// otherwise fallback to the default MemoryStore in development.
if (config.get('NODE_ENV') === 'production') {
    sessionConfig.store = new MemcachedStore({
        hosts: [config.get('MEMCACHE_URL')]
    });
}

app.use(session(sessionConfig));
// [END session]

// OAuth2
app.use(passport.initialize());
app.use(passport.session());
app.use(require('./lib/oauth2').router);

app.use(express.static('public'));

const router = express.Router();
// Use the oauth middleware to automatically get the user's profile
// information and expose login/logout URLs to templates.
app.use(oauth2.template);
// Redirect root to /books
app.get('/', (req, res) => {
    res.redirect('/auth');
})
app.get('/auth', (req, res) => {

    if(req.user){
        res.redirect('/room');
    }else{
        res.render('books/list.jade', {
            books: {},
            nextPageToken: {}
        });
    }
});
app.get('/room', (req, res) => {
    if (req.user  ) {
        res.render('books/room.jade');
        if(!app.rooms)app.rooms=[];
        if(!app.rooms[app.rooms.length-1] ){
            addRoom();
        }
        app.lastUser = req.user;
    }else{
        res.redirect('/');
    }


});

let addRoom=()=>{
    var maxcountINRoom = 2;
    io.on('connection', function (socket) {
        if(!app.rooms[app.rooms.length-1]  || app.rooms[app.rooms.length-1].users.length>maxcountINRoom){
            app.rooms.push({name:Date.now(),users:[],pos:[]});
        }
        var users = app.rooms[app.rooms.length-1].users;
        var user = app.lastUser;
        for(var i =0;i<users.length;i++){
            if(users[i].id== user.id)return;
        }

        users.push(user);
        user.time = (new Date).toLocaleTimeString();
        var room =  app.rooms[app.rooms.length-1],
            idU = room.users.length-1;

        socket.room = room;
        socket.join(room.name);

        // Посылаем клиенту сообщение о том, что он успешно подключился и его имя
        socket.json.send({'event': 'connected', users:users,user:user});
        // Посылаем всем остальным пользователям, что подключился новый клиент и его имя

        socket.broadcast.to(room.name).json.send({'event': 'userJoined', user:user});
        // Навешиваем обработчик на входящее сообщение

        socket.on('message', function (msg) {
            var room  = socket.room;
            if(msg.id_room){
                for(var d =0;d<room.pos.length;d++){
                    if(room.pos[d].user.id == msg.user.id)return;
                }
                room.pos.push(msg);
               if(room.pos.length>maxcountINRoom){
                   var min=0,center = {x:225,y:225};
                   room.pos.forEach(function (o){
                       o.dist= [];
                       for(var i=0;i<o.points.length;i++){
                           o.dist.push(Math.sqrt(Math.pow(center.x - o.points[i].x, 2)+Math.pow(center.y - o.points[i].y, 2)));
                       }
                       o.min =  o.dist.length?Math.min.call(Math,o.dist):450;
                   });
                   room.pos = room.pos.sort(function (a,b) {
                       return a.min<b.min;
                   });
                   room.pos.forEach(function (o,k){
                       o.position = o.min>=450?3:k+1;
                   });

                   var result = room.pos.concat([]);
                   while(room.pos.length){
                       room.pos.shift();
                   }
                   socket.json.send({'event': 'getResults', data:result});
                   socket.broadcast.to(room.name).json.send({'event': 'getResults', data:result});

               }
            }
        });
        socket.on('disconnect', function () {
            room.users.splice(idU,1);
            socket.leave(room.name);
            var time = (new Date).toLocaleTimeString();
            socket.broadcast.to(room.name).json.send({'event': 'userSplit', user:user});
        });

        if(users.length>maxcountINRoom){


            let countTimer = (startB,onCount,onFinishCount,callback)=>{
                var startB = startB;
                var interv = setInterval(function(){

                    if(startB <= 0 || users.length<maxcountINRoom){
                        clearInterval(interv);
                        if( users.length<maxcountINRoom)return;
                        if(callback)callback();
                    }
                    var value = startB > 0?startB:room.name;
                    var ev = startB > 0?onCount:onFinishCount;
                    socket.json.send({'event': ev, 'value': value});
                    socket.broadcast.to(room.name).json.send({'event': ev, 'value': value});
                    startB--;
                },1000);
            }
            countTimer(5,'startWarn',"startGame",function(){return  countTimer(5,'onGameFinish',"getCircle") })
        }
    });
}


// Basic 404 handler
app.use((req, res) => {
    res.status(404).send('Not Found!');
});

// Basic error handler
app.use((err, req, res, next) => {
    /* jshint unused:false */
    console.error(err);
    // If our routes specified a specific response, then send that. Otherwise,
    // send a generic message so as not to leak anything.
    res.status(500).send(err.response || 'Something broke!');
});

if (module === require.main) {
    // Start the server
    const server = http.listen(process.env.PORT || config.get('PORT'), () => {
        const port = server.address().port;
        console.log(`App listening on port ${port}`);
    });
}

module.exports = app;
