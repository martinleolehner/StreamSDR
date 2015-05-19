/*
* Copyright 2015 Martin Lehner - Hes-so Valais / Wallis
*
* This file is part of StreamSDR
*
* StreamSDR is free software; you can redistribute it and/or modify
* it under the terms of the GNU General Public License as published by
* the Free Software Foundation; either version 3, or (at your option)
* any later version.
*
* StreamSDR is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU General Public License for more details.
*
* You should have received a copy of the GNU General Public License
* along with StreamSDR. If not, see <http://www.gnu.org/licenses/>.
*/

var audioPlayer = {
    audio: null,

    init: function(volume)
    {
        this.audio = $("#audioStream")[0];

        if(!this.audio) return;

        this.audio.muted = true;
        this.audio.volume = 0.8;

        if(this.audio.muted == true)
        {
            $("#mute").show();
        }

        this.audio.muted = false;

        if(this.audio.volume == 0.8)
        {
            $("#volume").show();
        }

        this.audio.volume = volume;

        this.audio.onplay = function() {
            $("#play").attr("src", "img/pause.png");
            $("#favicon").attr("href", "favicon_playing.ico");
        };

        this.audio.onplaying = function() {
            $("#play").attr("src", "img/pause.png");
            $("#favicon").attr("href", "favicon_playing.ico");
        };

        this.audio.onpause = function() {
            $("#play").attr("src", "img/play.png");
            $("#favicon").attr("href", "favicon_paused.ico");
        };

        this.audio.onerror = function()
        {
            updateStatus("An error occured, try to stop and restart the audio.");
            this.pause();
        };

        this.audio.onstalled = function()
        {
            updateStatus("Could not stream audio, try to stop and restart the audio.");
            this.pause();
        };

        //this.playStream();
    },

    playStream: function()
    {
        if(!this.audio) return;

        if(this.audio.src == "")
        {
            this.audio.src = streamUri;
            this.audio.load();
            this.audio.play();
        }
        else if(this.audio.paused) this.audio.play();
        else this.audio.pause();
    },

    playLive: function()
    {
        if(!this.audio) return;

        if(this.audio.src == "") this.audio.src = streamUri;
        this.audio.load();
        this.audio.play();
    },

    stopStream: function()
    {
        if(!this.audio) return;

        this.audio.src = "";
        $("#audioStream").removeAttr("src");
        this.audio.load();

        $("#play").attr("src", "img/play.png");
        $("#favicon").attr("href", "favicon.ico");
    },

    setVolumePercent: function(percent)
    {
        if(!this.audio) return;

        this.audio.muted = false;
        if(percent <= 0) this.audio.volume = 0;
        else if(percent >= 100) this.audio.volume = 1;
        else this.audio.volume = 0.01*percent;

        $("#mute").attr("src", ((this.audio.volume > 0)? "img/mute.png" : "img/unmute.png"));

        if(typeof setData == "function") setData("volume", this.audio.volume);
    },

    lower: function()
    {
        if(!this.audio) return;
        this.audio.muted = false;
        this.audio.volume = ((this.audio.volume - 0.05) < 0)? 0 : this.audio.volume - 0.05;

        $("#mute").attr("src", ((this.audio.volume > 0)? "img/mute.png" : "img/unmute.png"));

        if(typeof setData == "function") setData("volume", this.audio.volume);
    },

    louder: function()
    {
        if(!this.audio) return;
        this.audio.muted = false;
        this.audio.volume = ((this.audio.volume + 0.05) > 1)? 1 : this.audio.volume + 0.05;

        $("#mute").attr("src", ((this.audio.volume > 0)? "img/mute.png" : "img/unmute.png"));

        if(typeof setData == "function") setData("volume", this.audio.volume);
    },

    mute: function()
    {
        if(!this.audio) return;
        this.audio.muted = !this.audio.muted;

        $("#volume").val(this.audio.muted? 0 : this.audio.volume*100);

        $("#mute").attr("src", (this.audio.muted? "img/unmute.png" : "img/mute.png"));
    },
};
