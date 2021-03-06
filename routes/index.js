var express = require('express');
var router = express.Router();
var uuidv1 = require('uuid/v1');
var multer = require('multer'); // multer handles forms posted to the
// server
var upload = multer();
var HashTable = require('hashtable');
var mysql = require('mysql');
var asyncErrDomain = require('domain');

// basic data & functions which should be available
// outside this module

router.connectinfoENV = getEnvConnectInfo();
router.sessConnectInfoBuilder = ConnectInfo;
router.sessShadowBuilder = SessionShadow;
router.upload = upload;
router.connHashTable = new HashTable();
router.cancel_current_session = function (conn, req, res) {
    try {
        // clear database part of session
        router.connHashTable.remove("con+" + req.sessionID);
        router.connHashTable.remove("roles+" + req.sessionID);
        router.connHashTable.remove("rolesTable+" + req.sessionID);
        // clear user part of session
        router.connHashTable.remove("query+" + req.sessionID);
        router.connHashTable.remove("query2+" + req.sessionID);
        router.connHashTable.remove("newuserdata+" + req.sessionID);
        if (conn != null) {
            conn.destroy();	// close database connection
        }
        // destroy session
        req.session.destroy(function (err) {
            // cannot access session here
            if (err) {
                console.log(err);
            } else {
                res.render('restart', {
                    title: "New Session After Cancel",
                    url: '/'
                }, function (err, html) {
                    if (err != null) {
                        console.log(err);
                    } else {
                        // html value comes from rendering the Jade template.
                        console.log(html);
                        res.send(html);
                    }
                });
            }
        });
    } catch (error) {
        console.log("Some errors may be specific to development: " + error);
        //    Should the program exit?
    }
}

router.start_new_user = function (ss, req, res) {
    res.render('users',
        Object.assign(Object.assign(Object.assign({}, userdefaults),
            {title: "HyperCMS User Account: " + req.sessionID}),
            {role_ph: router.connHashTable.get("roles+" + req.sessionID)}),
        function (err, html) {
            if (err != null) {
                console.log(err);
            } else {
                // clear user session
                router.connHashTable.remove("query+" + req.sessionID);
                router.connHashTable.remove("query2+" + req.sessionID);
                router.connHashTable.remove("newuserdata+" + req.sessionID);
                // html value comes from rendering the Jade template.
                console.log(html);
                res.send(html);
            }
        });
}

/* Setting up routes callbacks */
router.get('/', function (req, res, next) {
    var cio = req.session.connectInfoSession = new router.sessConnectInfoBuilder(router.connectinfoENV.host,
        router.connectinfoENV.user,
        router.connectinfoENV.password,
        router.connectinfoENV.database,
        false, false, null);

    res.render('index', {
        title: "MySQL Session: " + req.sessionID,
        db_server_ph: cio.host,
        db_login_ph: cio.user,
        db_password_ph: ((cio.password == "") ? "*No Default*" : "*Default****"),
        db_database_ph: cio.database
    }, function (err, html) {
        if (err != null) {
            console.log(err);
        } else {
            // html value comes from rendering the index.jade template.
            console.log(html);
            res.send(html);
        }
    });
});

router.post('/hostname', router.upload.none(), function (req, res, next) {
    var cio = req.session.connectInfoSession;
    var ss = new router.sessShadowBuilder(cio);
    // these values come from the HTTP POST'd form after login is click'd
    var newconnectinfo = {
        host: req.body.servername,
        user: req.body.login,
        password: req.body.password,
        database: req.body.database
    };
    // password must be confirmed to try to login
    var status = ss.tryToLogin(newconnectinfo, req.body.confirmPassword, req, res);

    if (status == false) {
        // session defaults were maybe updated but not acceptable for connecting to database
        ss.retryGetDatabaseLoginInfo(req, res); // sends a variant
    }
    // if status return was true, waiting for database server response
});

// We don't have to use a POST for this route.
// Because there are no form entries,
// a GET would also work

var userdefaults = {
    url: "https://interestingengineering.com/tommy-flowers-the-man-who-built-colossus",
    email_ph: 'Tommy.Flowers@colossus.GPO.UK.gov',
    hcmspassword_ph: '0123456789',
    confirmPassword_ph: '0123456789',
    lastname_ph: 'Doe',
    firstname_ph: 'John',
    middlename_ph: 'Anonymous',
    phone_ph: '(555) 555-5555',
    jobTitle_ph: 'wage slave'
};

router.userdefaults = userdefaults;

router.post('/dbpause', upload.none(), function (req, res, next) {
    var cio = req.session.connectInfoSession;
    var ss = new router.sessShadowBuilder(cio);
    var whattodo = {
        cancel: req.body.button_cancel,
        continue: req.body.button_continue
    }
    var conn = router.connHashTable.get("con+" + req.sessionID);
    if (conn == undefined)
        conn = null;

    if (whattodo.cancel == "cancel") {
        router.cancel_current_session(conn, req, res);
    } else if (conn != null) {
        router.start_new_user(ss, req, res);
    } else res.render('dbpause', {title: 'Database not yet ready: ' + req.sessionID},
        function (err, html) {
            if (err != null) {
                console.log(err);
            } else {
                console.log(html); // the MySQL Login form
                res.send(html);
            }
        });
});

// The ConnectInfo object must be serializable into JSON -- hence one object for fields & one for methods

/* Constructors */

function ConnectInfo(dbhost, dbuser, dbpassword, dbdatabase, isConnectInfoTryable) {
    // session field
    this.host = dbhost;
    this.user = dbuser;
    this.password = dbpassword;
    this.database = dbdatabase;
    // boolean fields
    this.isConnectInfoTryable = isConnectInfoTryable;/* This field is probably unnecessary */
}

function SessionShadow(cio) {
    // this object shadows the ConnectionInfo object
    // the CIO must be serializable into JSON
    // it cannot contain methods
    this.cio = cio;
    // route logic methods
    this.tryToLogin = tryToLogin;
    this.isDatabaseOK = isDatabaseOK;
    this.retryGetDatabaseLoginInfo = retryGetDatabaseLoginInfo;

    // field access methods
    // session generated
    // strictly speaking getSessionID is not a method
    // -- just function attached to object
    // this.getSessionID = getSessionID;
    // configuration info
    this.setHost = setHost;
    this.getHost = getHost;
    this.setUser = setUser;
    this.getUser = getUser;
    this.setPassword = setPassword;
    this.getPassword = getPassword;
    this.setDatabase = setDatabase;
    this.getDatabase = getDatabase;
    // status info
    this.setConnectInfoTryable = setConnectInfoTryable;
    //isConnectInfoTryable may be redundant & unnecessary
    // this.getConnectInfoTryable = getConnectInfoTryable;
}

/* SessionID is set by the session package on reception*/
/* of the original get request. This getter may not be*/
/* be needed -- maybe arg should be res & not req. */
// var getSessionID = function getSessionID(req) {
//    return (req.sessionID);
//}

/* methods */
var setHost = function (val) {
    this.cio.host = val;
}
var getHost = function () {
    return (this.cio.host);
}
var setUser = function (val) {
    this.cio.user = val;
}
var getUser = function () {
    return (this.cio.user);
}
var setPassword = function (val) {
    this.cio.password = val;
}
var getPassword = function () {
    return (this.cio.password);
}
var setDatabase = function (val) {
    this.cio.database = val;
}
var getDatabase = function () {
    return (this.cio.database);
}
// if isConnectionInfoTryable is unnecessary,
// then this setter is unnecessary.
var setConnectInfoTryable = function (status) {
    this.cio.isConnectInfoTryable = status;
};
//var getConnectInfoTryable = function (status) {
//    return (this.cio.isConnectInfoTryable);
//};


var tryToLogin = function (newconnectinfo, confirmPassword, req, res) {
    var ss = this;
    var cio = this.cio;
    // newconnectinfo came from the latest submitted form.
    // it must be checked for minimal sanity.
    // "" does not override a valid string.
    // The following overrides the environment.
    if (newconnectinfo.host != "")
        this.setHost(newconnectinfo.host);
    if (newconnectinfo.user != "")
        this.setUser(newconnectinfo.user);
    if (newconnectinfo.password != "")
        this.setPassword(newconnectinfo.password);
    if (newconnectinfo.database != "")
        this.setDatabase(newconnectinfo.database);

    this.isConnectInfoTryable = false;
    if ((confirmPassword != "") && (this.getPassword() != confirmPassword))
        return false;
    if ((this.getHost() == "") || (this.getUser() == "") || (this.getPassword() == "") || (this.getDatabase() == ""))
        return false; /* cannot try the connection, need more info */

    this.setConnectInfoTryable(true);
    var con = mysql.createConnection({
        host: this.getHost(),
        user: this.getUser(),
        password: this.getPassword(),
        database: this.getDatabase()
    });
    con.connect(function (err) {
        // con is object with its own this
        if (err) {
            console.log(err);
            console.log("Need to retry with new connect info!");
            // different this
            ss.setConnectInfoTryable(false);
            res.render('index', {title: 'MySQL Reconnect: ' + req.sessionID},
                function (err, html) {
                    if (err != null) {
                        console.log(err);
                    } else {
                        console.log(html); // the MySQL Login form
                        res.send(html);
                    }
                });
        } else {
            console.log("Connected to MySQL server!");
            ss.setConnectInfoTryable(true);
            ss.isDatabaseOK(con, req, res);
            var valid = router.connHashTable.get("con+" + req.sessionID);
            if (valid == undefined)
                valid = null;
            if (valid != null) { // a quick successful connect to database
                res.render('users', {title: 'Choose User ' + req.sessionID},
                    function (err, html) {
                        if (err != null) {
                            console.log(err);
                        } else {
                            console.log(html); // the MySQL Login form
                            res.send(html);
                        }
                    });
            } else {
                res.render('dbpause', {title: 'Check Database: ' + req.sessionID},
                    function (err, html) {
                        if (err != null) {
                            console.log(err);
                        } else {
                            console.log(html); // the MySQL Login form
                            res.send(html);
                        }
                    });
            }
        }
    });
}

var isDatabaseOK = function (con, req, res) {
    // if res is non-null, there is a browser session to which there must be response
    var testingDataBase = asyncErrDomain.create(); // testingDataBase is object
    var ss = this;
    var cio = ss.cio;
    testingDataBase.on('error', function (err) {
        console.log("Could not get to Users datatable.")
        console.log("Is the correct MySQL server selected?")
        ss.setConnectInfoTryable(false);
        if (res != null) // remnant of old code?
            res.render('index', {title: 'MySQL Reconnect Page: ' + ss.sessionID}, function (err, html) {
                if (err != null) {
                    console.log(err);
                } else {
                    console.log(html); // the MySQL Login form
                    res.send(html);
                }
            });
    });
    // we depend on the closure for the correct con object
    // I suppose we could use the hashtable, but then we would depend on
    // getting correct req.sessionID from res.req.
    testingDataBase.run(function () {
        // This should be rewritten as chained promises
        con.query("show databases;", function (err, result) {
            if (err) {
                console.log("No databases!");
                throw err;
            }
            console.log("Available Databases: ");
            for (var idb = 0; idb < result.length; ++idb) {
                console.log(result[idb]);
            }
            con.query("use " + ss.getDatabase() + ";", function (err, result) {
                if (err) {
                    console.log("Unable to use specified database: " + ss.getDatabase() + "!");
                    throw err;
                }
                console.log(result);
                con.query("show tables;", function (err, result) {
                    if (err) {
                        console.log("Unable to show tables!");
                        throw err;
                    }
                    console.log(result);
                    con.query("describe Roles;", function (err, result) {
                        if (err) {
                            console.log("Unable to describe Roles!");
                            throw err;
                        }
                        console.log(result);
                        con.query("select * from Roles;", function (err, result) {
                            if (err) {
                                console.log("No databases!")
                                throw err;
                            }
                            console.log("Available Roles: ");
                            var roles = "";
                            for (var idb = 0; idb < result.length; ++idb) {
                                console.log(result[idb]);
                                roles += result[idb].code + (((result.length - idb) > 1) ? "/" : "");
                            }
                            router.connHashTable.put("roles+" + req.sessionID, roles);
                            router.connHashTable.put("rolesTable+" + req.sessionID, result);
                            console.log("Roles are: " + roles);
                            con.query("describe Users;", function (err, result) {
                                if (err) {
                                    console.log("Unable to describe Users!");
                                    throw err;
                                }
                                console.log(result);
                                // Here we add new entry to hashtable.
                                router.connHashTable.put("con+" + req.sessionID, con);
                                console.log("Logged in!")
                            });
                        });
                    });
                });
            });
        });
    });
}

// passwords did not agree -- other parameters might be bad
// did not update the session specific parameters with data
// entered from browser.

var retryGetDatabaseLoginInfo = function (req, res) {
    console.log(this.getCio().toString());
    res.render('index', {
        title: "MySQL Try Again: " + req.sessionID,
        db_server_ph: this.getHost(),
        db_login_ph: this.getUser(),
        db_password_ph: ((this.getPassword() == "") ? "*No Default*" : "*Default****"),
        db_database_ph: this.getDatabase()
    }, function (err, html) {
        if (err != null) {
            console.log(err);
        } else {
            // html value comes from rendering the Jade template.
            console.log(html);
            res.send(html);
        }
    });
}

// There is only one group of environment connection parameters,
// which can be overridden.
// These are only read once on server start up.
// Maybe the client browser should get these.

function getEnvConnectInfo() {
    var temp = null;
    return {
        host: ((temp = process.env.CMSDBHOST) === undefined ? "" : temp),
        user: ((temp = process.env.CMSDBUSER) === undefined ? "" : temp),
        password: ((temp = process.env.CMSDBPASSWORD) === undefined ? "" : temp),
        database: ((temp = process.env.CMSDBDATABASE) === undefined ? "" : temp)
    };
}

module.exports = router;
