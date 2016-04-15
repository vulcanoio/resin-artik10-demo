(function() {
  'use strict';

  const samiURL = process.env.SAMI_URL || "https://api.samsungsami.io/v1.1";
  const device_token = process.env.SAMI_DEVICE_TOKEN || null;
  const device_id = process.env.SAMI_DEVICE_ID|| null;
  const sensor_threshold = process.env.SENSOR_THRESHOLD || 1300;
  const poll_interval = process.env.POLL_INTERVAL || 500; // Defaults to 0.5 second
  const screen_timeout = process.env.SCREEN_TIMEOUT || 500; // Defaults to 0.5 seconds
  var Sami = require('node-sami');
  var fs = require('fs');
  const exec = require('child_process').exec;
  var express = require('express');
  var app = express();
  var last_detection = false;

  const sami = new Sami({
      baseUrl: samiURL,
      token: device_token
  });

  var sensor_active_image = "/usr/src/app/assets/sensor-touch.raw";

  var startup_image = "/usr/src/app/assets/screen2.raw";
  enable_proximity_sensor();

  display_image_raw(startup_image);

  /**
  * Function that enables proximity sensor
  */
  function enable_proximity_sensor() {
    setInterval(function() {
      if (read_adc0() > sensor_threshold) {
        if (last_detection == false) {
          proximity_actions();
        }
        last_detection = true;
      }else{
        if (last_detection == true){
          setTimeout(function() {
            if (read_adc0() < sensor_threshold){
              display_image_raw(startup_image);
            }
          },screen_timeout);
        }
        last_detection = false;
      }
    }, poll_interval);
  }

  /**
  * Actions to execute on proximity.
  */
  function proximity_actions() {
    display_image_raw(sensor_active_image);
    push2sami();
  }

  // Code to ensure that the screen does not sleep
  const screen_unblank_interval = 5*60*1000;
  unblank_screen();
  setInterval(function(){
    unblank_screen();
  }, screen_unblank_interval);

  /**
  * Pushes a message to SAMI
  */
  function push2sami () {
    if(device_token && device_id){
      sami.messages.sendMessageAction(
          {
            "sdid": device_id,
            "ts": new Date().valueOf(),
            "type": "message",
            "data": {
                "uuid": process.env.RESIN_DEVICE_UUID,
                "sensor": "Proximity",
                "event": "Movement"
            }
      }, function(error, response) {
        if (error) console.log(error);
      });
    } else {
      console.log("Missing environment variable SAMI_DEVICE_TOKEN/SAMI_DEVICE_ID");
    }
  }

  /**
  * Unblank fb0 screen
  */
  function unblank_screen(){
    fs.access('/sys/class/graphics/fb0/blank', fs.F_OK, function(err) {
      if (!err) {
        exec('echo 0 > /sys/class/graphics/fb0/blank', (error, stdout, stderr) => {
          if (stderr) {
            console.log(stderr);
          }
        });
      } else {
        console.log("MPI screen missing.");
      }
    });
  }

  /**
  * Display image on screen fb0
  * @param {string} image
  */
  function display_image(image){
    exec('fbi -T 2 '+ image, (error, stdout, stderr) => {
      if (error) {
        console.log(error);
      }
    });
  }

  /**
  * Display raw image on screen fb0
  * @param {string} image
  */
  function display_image_raw(image){
    exec('cat '+ image + ' > /dev/fb0', (error, stdout, stderr) => {
      if (error) {
        console.log(error);
      }
    });
  }

  /* Read ADC0 for Artik10 - Note the hardcoded sys path for the sensor
  */
  function read_adc0(){
    return parseInt(fs.readFileSync('/sys/devices/12d10000.adc/iio:device0/in_voltage0_raw'));
  }

  // Sensor failover
  app.get('/', function (req, res) {
    res.send('Hey SDC!');
  });

  app.get('/activate',function (req, res) {
    proximity_actions();
    last_detection = true;
    res.send('OK!');
  });

  app.get('/adc0',function (req, res) {
    res.send(read_adc0().toString());
  });

  app.listen(80, function () {
    console.log('All Set!');
  });

})();
