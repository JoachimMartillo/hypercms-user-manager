var express = require('express'); // I probably use too many semicolons
var path = require('path');
var favicon = require('static-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var asyncErrDomain = require('domain');
var uniqueid = require('uniqueid')

var webStart = require('./routes/index');
var userManage = require('./routes/users');
var session = require('express-session');

// I think only the database connection info & the actual connection
// needs to be stored in the session data
// Default database server, database user, database password
// can be grabbed from environment

//set up webStart object, which handles web login to MySQL server.
webStart.userManage = userManage;
webStart.setLoggedIn = setLoggedIn;
webStart.setConnectInfoTryable = setConnectInfoTryable;

//set up userManage object, which handles viewing or modifying Users data table.
userManage.webStart = webStart; // so that we can get to db login screen if not already logged in
userManage.setLoggedIn = setLoggedIn;
userManage.setConnectInfoTryable = setConnectInfoTryable;

var app = express(); // this is the basic express app routing engine
var multer = require('multer'); // multer handles forms posted to the server
var upload = multer();


var mysql = require('mysql');
// I like to minimize number of global variables through aggregation

// just like to know start time -- I always add this line for logging
var dateString = new Date().toUTCString();
console.log('Starting server at ' + dateString); // print out start time to console

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
// I still don't understand how to use favicon
// app.use(favicon());

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({ secret: 'this-is-a-secret-token', cookie: { maxAge: 60000 }}));

// set up routes

app.use('/', webStart);
app.use('/userdisplay', userManage);

app.post('/hostname', upload.none(), function (req, res, next) {
    var connectinfo = {
        host: req.body.servername,
        user: req.body.login,
        password: req.body.password
    };
    // in theory the received form contains login data
    // I should probably implement a complete connectinfo object
    // that includes login method
    tryToLogin(connectinfo, res);
});

app.post('/usermanagement', upload.none(), function (req, res, next) {
    var queryinfo = {
        email: req.body.email,
        hcmspassword: req.body.hcmspassword,
        confirmPassword: req.body.confirmPassword,
        lastname: req.body.lastname,
        firstname: req.body.firstname,
        middlename: req.body.middlename,
        phone: req.body.phone,
        jobTitle: req.body.jobTitle,
        button_create: req.body.button_create,
        button_view: req.body.button_view,
        button_edit: req.body.button_edit
    };
    isDatabaseStillOK(connectinfo.connection, queryinfo, res);
});

/// catch 404 and forwarding to error handler
app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

/// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function (err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err // I guess this line forces the stack trace
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

updateConnectInfoFromEnv();

function tryToLogin(connectinfo, res) {
    var con = mysql.createConnection({
        host: connectinfo.host,
        user: connectinfo.user,
        password: connectinfo.password,
        database: '527700_cms_bostonscientific_db'
    });

    setCon(connectinfo, con);

    con.connect(function (err) {
        if (err) {
            console.log("Need to retry with new connect info!");
            setConnectInfoTryable(false);
            app.use('/', webStart);
            if (res)
                res.render('index', {title: 'MySQL Login Page'}, function (err, html) {
                    if (err != null) {
                        console.log(err);
                    } else {
                        console.log(html); // the MySQL Login form
                        res.send(html);
                    }
                });
        } else {
            console.log("Connected to MySQL server!");
            setConnectInfoTryable(true);
            isDatabaseOK(con, res);
        }
    });
}

function isDatabaseStillOK(con, queryinfo, res) {
    var testingDataBase = asyncErrDomain.create();
    testingDataBase.on('error', function (err) {
        console.log("Connection to Database Server is broken.")
        setConnectInfoTryable(false);
        setLoggedIn(false);
        app.use('/', webStart);
        res.render('index', {title: 'MySQL Reconnect Page'}, function (err, html) {
            if (err != null) {
                console.log(err);
            } else {
                console.log(html); // the MySQL Login form
                res.send(html);
            }
        });
    });

    testingDataBase.run(function () {
        con.query("show databases;", function (err, result) {
            if (err)
                throw err;
            console.log("Available Databases: ");
            for (idb = 0; idb < result.length; ++idb) {
                console.log(result[idb]);
            }
            con.query("use " + connectinfo.database + ";", function (err, result) {
                if (err)
                    throw err;
                console.log(result);
                con.query("show tables;", function (err, result) {
                    if (err)
                        throw err;
                    console.log(result);
                    con.query("describe Users;", function (err, result) {
                        if (err)
                            throw err;
                        console.log(result);
                        setLoggedIn(true);

                        if (queryinfo.button_create != null) {
                            mysql_create(query_info, connectinfo.connection);
                            res.render('users', {title: 'User Create Page'}, function (err, html) {
                                if (err != null) {
                                    console.log(err);
                                } else {
                                    console.log(html);
                                    res.send(html);
                                }
                            });
                        } else if (queryinfo.button_edit != null) {
                            mysql_update(query_info, connectinfo.connection);
                            res.render('users', {title: 'User View Page'}, function (err, html) {
                                if (err != null) {
                                    console.log(err);
                                } else {
                                    console.log(html);
                                    res.send(html);
                                }
                            });
                        } else {
                            mysql_view(query_info, connectinfo.connection);
                            res.render('users', {title: 'User Display Page'}, function (err, html) {
                                if (err != null) {
                                    console.log(err);
                                } else {
                                    console.log(html);
                                    res.send(html);
                                }
                            });
                        }
                    });
                });
            });
        });
    });
}

function isDatabaseOK(connectinfo, con, res) {
    // if res is non-null, there is a browser sess to which there must be response
    var testingDataBase = asyncErrDomain.create();
    testingDataBase.on('error', function (err) {
        console.log("Could not get to Users datatable.")
        console.log("Is the correct MySQL server selected?")
        setConnectInfoTryable(connectinfo,false);
        setLoggedIn(connectinfo,false);
        app.use('/', webStart);
        if (res != null)
            res.render('index', {title: 'MySQL Reconnect Page'}, function (err, html) {
                if (err != null) {
                    console.log(err);
                } else {
                    console.log(html); // the MySQL Login form
                    res.send(html);
                }
            });
    });

    testingDataBase.run(function () {
        con.query("show databases;", function (err, result) {
            if (err)
                throw err;
            console.log("Available Databases: ");
            for (idb = 0; idb < result.length; ++idb) {
                console.log(result[idb]);
            }
            con.query("use " + connectinfo.database + ";", function (err, result) {
                if (err)
                    throw err;
                console.log(result);
                con.query("show tables;", function (err, result) {
                    if (err)
                        throw err;
                    console.log(result);
                    con.query("describe Users;", function (err, result) {
                        if (err)
                            throw err;
                        console.log(result);
                        setLoggedIn(connectinfo,true);
                        if (res)
                            res.render('users', {title: 'Users Management Page'}, function (err, html) {
                                if (err != null) {
                                    console.log(err);
                                } else {
                                    console.log(html);
                                    res.send(html);
                                }
                            });
                    });
                });
            });
        });
    });
}


function updateConnectInfoFromEnv() {
    var connectinfo = {
        host: process.env.CMSDBHOST,
        user: process.env.CMSDBUSER,
        password: process.env.CMSDBPASSWORD,
        database: '527700_cms_bostonscientific_db'
    };
    if ((connectinfo.host != undefined) &&
        (connectinfo.user != undefined) &&
        (connectinfo.password != undefined))
        setConnectInfoTryable(connectinfo, true);
    tryToLogin(connectinfo, null);
}

function setLoggedIn(connectinfo, status) {
    connectinfo.loggedIn = status;
}

function setConnectInfoTryable(connectinfo, status) {
    connectinfo.isConnectInfoTryable = status;
}

function setCon(connectinfo, connection) {
    connectinfo.connection = connection;
}

module.exports = app;
