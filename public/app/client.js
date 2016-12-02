window.onload = function () {
    // —оздаем соединение с сервером; websockets почему-то в ’роме не работают, используем xhr
    //if (navigator.userAgent.toLowerCase().indexOf('chrome') != -1) {
    //    socket = io.connect(location.origin, {'transports': ['xhr-polling']});
    //} else {
    socket = io.connect(location.origin);
    //}
    var signaturePad,user;
    socket.on('connect', function () {
        socket.on('message', function (msg) {
            // ƒобавл€ем в лог сообщение, заменив врем€, им€ и текст на полученные
            var str = 'abcdefghklmno';
            document.querySelector('#game').style.display = '';
            document.querySelector('#results').style.display = '';
            switch (msg.event) {
                case 'connected' :{
                    for(var i=0;i<msg.users.length;i++){
                        var elem = '<div class="user" userId="' + msg.users[i].id + '"><img src="' + msg.users[i].image + '"/><p>' + msg.users[i].displayName + '. Joined(' + msg.users[i].time + ')</p></div>';
                        document.querySelector('#log').innerHTML += elem;
                    }
                    user = msg.user;
                    break;
                }
                case 'userJoined':
                {
                    var elem = '<div class="user" userId="' + msg.user.id + '"><img src="' + msg.user.image + '"/><p>' + msg.user.displayName + '. Joined(' + msg.user.time + ')</p></div>';
                    document.querySelector('#log').innerHTML += elem;
                    break;
                }
                case 'userSplit':
                {
                    var elem = document.getElementsByClassName('user');
                    for (var i = 0; i < elem.length; i++) {
                        if (elem[i].getAttribute('userid') == msg.user.id)elem[i].remove();
                    }
                    document.querySelector('#warn').style.display = '';
                    break;
                }
                case 'startWarn':
                {
                    document.querySelector('#warn').style.display = 'block';
                    document.querySelector('#warnCount').innerHTML = msg.value;
                    break;
                }
                case 'startGame':
                {
                    document.querySelector('#warn').style.display = '';
                    var canvas =  document.querySelector('#draw-area>canvas');
                    canvas.width = canvas.height = 450;

                    signaturePad = signaturePad ||  new SignaturePad(canvas, {
                        minWidth: 1,
                        maxWidth: 10,
                        penColor: "rgb(66, 133, 244)",
                        onBegin:function(ev){
                            signaturePad.mouseDown = true;
                            signaturePad._points.push({x:ev.offsetX,y:ev.offsetX});
                        },onEnd:function(ev){
                                signaturePad.mouseDown = false;
                            signaturePad._points.push({x:ev.offsetX,y:ev.offsetX});
                        }
                    });
                    signaturePad.id_room = msg.value;
                    canvas.addEventListener('mousemove',function(ev){
                        if( signaturePad.mouseDown) signaturePad._points.push({x:ev.offsetX,y:ev.offsetY});
                    });
                    signaturePad._points =[];
                    signaturePad.on();
                    resizeCanvas();

                    function resizeCanvas() {
                        var ratio =  Math.max(window.devicePixelRatio || 1, 1);
                        canvas.width = canvas.offsetWidth * ratio;
                        canvas.height = canvas.offsetHeight * ratio;
                        canvas.getContext("2d").scale(ratio, ratio);
                        signaturePad.clear(); // otherwise isEmpty() might return incorrect value
                    }
                    break;
                }
                    case 'onGameFinish':{
                        document.querySelector('#game').style.display = 'block';
                        document.querySelector('#gameCount').innerHTML = msg.value;
                        break;
                    }
                case 'getCircle':
                {
                    signaturePad.off();
                    setTimeout(function(){
                        console.log("send");
                        socket.json.send(({points:signaturePad._points,id_room:signaturePad.id_room,user:user}));
                    },Math.random()*1000);


                    break;
                }
                case 'getResults':
                {
                    var results = document.querySelector('#results');
                    results.style.display = 'block';
                    var res ='';
                    for(var i=0;i<msg.data.length;i++){
                        var result = msg.data[i];
                        res +='<p>POSITION '+result.position+'; USER '+result.user.displayName+'</p>'
                    }
                    results.innerHTML += res;

                    break;
                }
            }
        });

    });
};