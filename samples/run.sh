#!/bin/bash

node ../af.js "meridian.mp4" "../demo/assets/meridian_h264.af" 1920 h264 5 23
node ../af.js "meridian.mp4" "../demo/assets/meridian_h265.af" 1920 h265 5 23

node ../af.js "meridian_portrait.mp4" "../demo/assets/p_meridian_h264.af" 800 h264 5 23
node ../af.js "meridian_portrait.mp4" "../demo/assets/p_meridian_h265.af" 800 h265 5 23