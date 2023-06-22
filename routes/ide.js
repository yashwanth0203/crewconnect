var express = require('express');
var router = express.Router();
const mongoose = require('mongoose');
const axios = require('axios');
var dotenv = require('dotenv');
dotenv.config({ path: "../.env" });

//const sgMail = require('@sendgrid/mail');
const collabSchema = require('../models/collabSchema');
//sgMail.setApiKey(process.env.TWILIO_SENDGRID_API_KEY)

router.get('/', async (req, res) => {
    if (!req.user) {
        res.render('ide', { title: "CrewConnect-IDE" });
    }
    else {
        const rooms = await Code.find({ createdBy: req.user._id });
        const collabrooms = await Collab.find({userid : req.user._id});
        if (rooms.length > 0 && collabrooms.length > 0) {
            res.render('ide', { title: "CrewConnect-IDE", rooms: rooms, collabroom : collabrooms});
        }
        else if (rooms.length > 0) {
            res.render('ide', { title: "CrewConnect-IDE", rooms: rooms});
        }
        else if (collabrooms.length > 0) {
            res.render('ide', { title: "CrewConnect-IDE", collabroom : collabrooms});
        }
        else {
            res.render('ide', { title: "CrewConnect-IDE" });
        }
    }
})

router.post('/createTask', async (req, res) => {
    if(!req.user) {
        res.redirect('/users/login');
    }
    else {
        var newTask = new Code({
            createdBy: req.user._id,
            name: req.body.roomname
        });
        newTask.save(function (err, data) {
            if (err) {
                console.log(err);
                res.render('error');
            } else {
                res.redirect('/ide/code/' + data._id);
            }
        })
    }
});

router.post('/deleteTask', async (req, res) => {
    res.set('Cache-Control', 'no-cache');
    try {
        const workspaceId = req.body.workspace;
        //const userId = req.user._id; // Assuming req.user contains the logged-in user's ID

        // Check if the logged-in user is the owner of the workspace
        const collab = await Code.findOne({ name: workspaceId });

        if (!collab) {
            // If the logged-in user is not the owner of the workspace, send an error response
            return res.status(403).send('You are not authorized to delete this workspace.');
        }

        // Delete the workspace
        const deletedWorkspace = await Code.findOneAndDelete({ name: workspaceId });

        if (deletedWorkspace) {
            res.send('Workspace deleted successfully');
        } else {
            res.send('Workspace not found');
        }
        //res.redirect('/');
    } catch (err) {
        console.log(err);
        res.status(500).send('Internal Server Error');
    }
});


router.route('/code/:id')
    .get(async (req, res) => {
        if (!req.user) {
            res.redirect('/');
        }
        else {
            if (req.params.id) {
                const data = await Code.findOne({ _id: mongoose.Types.ObjectId(req.params.id) });
                if (data) {
                    res.render('editor', {
                        content: data.content,
                        title: 'CrewConnect',
                        input: data.lastInput,
                        output: data.lastOutput,
                        timeused: data.lastTimeUsed,
                        memused: data.lastMemUsed,
                        roomId: data.id
                    });
                } else {
                    res.redirect('/error');
                }

            } else {
                res.redirect('/error');
            }
        }
    })

    .post(async (req, ress) => {
        if (!req.user) {
            ress.redirect('/');
        }
        else {
            var code = req.body.codes;
            var inp = req.body.input;
            var lang = req.body.langs;
            if(lang=="CPP")
                lang="CPP14";
            var runCode = {};
            runCode.time_limit = 5;
            runCode.memory_limit = 323244;
            runCode.source = code;
            runCode.input = inp;
            runCode.lang = lang;

            var resp;
            var flag = 0;
            const res = await axios.post('https://api.hackerearth.com/v4/partner/code-evaluation/submissions/', runCode, {
                headers: {
                    'content-type': 'application/json',
                    'client-secret': '3491da009ada6eaba1ea76cd4c8eca2323c23fd2'
                }
            })
                .then(async (response) => {
                    var urlOfCode = response.data.status_update_url;
                    var k = response.data.request_status.code;
                    while (k != 'REQUEST_COMPLETED' && k != 'REQUEST_FAILED') {
                        await axios.get(urlOfCode, {
                            headers: {
                                'client-secret': '3491da009ada6eaba1ea76cd4c8eca2323c23fd2'
                            }
                        })
                            .then(response => {
                                k = response.data.request_status.code;
                                resp = response;
                            })
                            .catch(err => console.log(err));

                        if (resp.data.result.run_status.time_used > 5) {
                            flag = 1;
                            break;
                        }
                        if (resp.data.result.run_status.status == 'TLE' || resp.data.result.run_status.status == 'OLE' || resp.data.result.run_status.status == 'MLE' || resp.data.result.run_status.status == 'RE') {
                            flag = 1;
                            break;
                        }
                        if (resp.data.request_status.code == 'CODE_COMPILED') {
                            if (resp.data.result.compile_status != 'OK') {
                                flag = 1;
                                break;
                            }
                        }
                    }
                    if (k == 'REQUEST_FAILED') {
                        ress.redirect('/error');
                    }
                    else {
                        if(flag == 0) {
                            const data = await Code.findOne({ _id: mongoose.Types.ObjectId(req.params.id) });
                            data.lastInput = inp;
                            await axios.get(resp.data.result.run_status.output)
                                .then(respo => {
                                    data.lastOutput = respo.data;
                                })
                                .catch(err => console.log(err));
                            data.lastTimeUsed = resp.data.result.run_status.time_used;
                            data.lastMemUsed = resp.data.result.run_status.memory_used;
                            await data.save();
                            ress.redirect('/ide/code/' + req.params.id);
                        }
                        else {
                            const data = await Code.findOne({ _id: mongoose.Types.ObjectId(req.params.id) });
                            data.lastInput = inp;
                            if(resp.data.result.compile_status != 'OK') {
                                data.lastOutput = resp.data.result.compile_status;
                            }
                            else {
                                data.lastOutput = resp.data.result.run_status.status_detail;
                            }
                            data.lastTimeUsed = resp.data.result.run_status.time_used;
                            data.lastMemUsed = resp.data.result.run_status.memory_used;
                            await data.save();
                            ress.redirect('/ide/code/' + req.params.id);
                        }
                    }

                })
                //.catch(err =>
                    //console.log(resp.data)
                //);
        }
    });
    
module.exports = router;