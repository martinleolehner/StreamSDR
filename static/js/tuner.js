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

var tuner = {
    enabled: false,
    canvas: null,
    ctx: null,
    currentFrequency: 92e6,
    favoriteHovered: -1,
    hertzPerPixel: 1e4,
    pixelRatio: 1,
    zoom: 4,
    dragging: false,
    dragStart: null,
    lastDragPos: null,
    lastDragTime: null,
    speed: 0,
    moveInterval: null,
    timeout: null,

    init: function(frequency, tunerZoom)
    {
        this.currentFrequency = frequency;
        this.canvas = $("#tuner")[0];
        this.ctx = this.canvas.getContext("2d");
        if(!this.ctx) return;

        if(tunerZoom >= 3 && tunerZoom <= 6) this.zoom = tunerZoom;
        this.hertzPerPixel = Math.pow(10, this.zoom);
        this.checkEndZoom();

        this.canvas.addEventListener("selectstart", function(e) { e.preventDefault(); return false; }, false);

        this.canvas.addEventListener("mousedown", function(e) {
            if(!tuner.enabled) return;
            e.preventDefault();
            tuner.moveStart(e);
        });

        this.canvas.addEventListener("touchstart", function(e) {
            if(!tuner.enabled) return;
            e.preventDefault();
            tuner.moveStart(e);
        });

        this.canvas.addEventListener("mouseout", function(e) {
            if(!tuner.enabled) return;
            //if(!tuner.dragging || !tuner.dragStart) return;
            tuner.dragging = false;
            tuner.dragStart = null;
            tuner.favoriteHovered = -1;

            tuner.currentFrequency = currentFrequency;
            tuner.draw(tuner.currentFrequency);
            $("#frequency").val((tuner.currentFrequency/1e6) + " MHz");
        });

        this.canvas.addEventListener("touchcancel", function(e) {
            if(!tuner.enabled) return;
            if(!tuner.dragging || !tuner.dragStart) return;
            tuner.dragging = false;
            tuner.dragStart = null;

            tuner.draw(tuner.currentFrequency);
            $("#frequency").val((tuner.currentFrequency/1e6) + " MHz");
        });

        this.canvas.addEventListener("mousemove", function(e) {
            if(!tuner.enabled) return;
            e.preventDefault();
            tuner.move(e);
        });

        this.canvas.addEventListener("touchmove", function(e) {
            if(!tuner.enabled) return;
            e.preventDefault();
            tuner.move(e);
        });

        this.canvas.addEventListener("mouseup", function(e) {
            if(!tuner.enabled) return;
            e.preventDefault();
            tuner.moveEnd(e);
        });

        this.canvas.addEventListener("touchend", function(e) {
            if(!tuner.enabled) return;
            e.preventDefault();
            tuner.moveEnd(e);
        });

        this.draw(this.currentFrequency);
    },

    enable: function()
    {
        this.enabled = true;
        this.dragging = false;
        this.dragStart = null;
        this.draw(this.currentFrequency);
    },

    disable: function()
    {
        this.enabled = false;
        this.dragging = false;
        this.dragStart = null;
        this.draw(this.currentFrequency);
    },

    zoomOut: function()
    {
        if(this.zoom < 6)
        {
            this.zoom = Math.round(this.zoom+1);
            this.hertzPerPixel = Math.pow(10, this.zoom);
            this.draw(this.currentFrequency);
            this.checkEndZoom();

            if(typeof setData == "function") setData("tunerZoom", this.zoom);
        }
    },

    zoomIn: function()
    {
        if(this.zoom > 3)
        {
            this.zoom = Math.round(this.zoom-1);
            this.hertzPerPixel = Math.pow(10, this.zoom);
            this.draw(this.currentFrequency);
            this.checkEndZoom();

            if(typeof setData == "function") setData("tunerZoom", this.zoom);
        }
    },

    checkEndZoom: function()
    {
        if(this.zoom <= 3)
        {
            $("#zoomOut").removeClass("endZoom");
            $("#zoomIn").addClass("endZoom");
        }
        else if(this.zoom >= 6)
        {
            $("#zoomIn").removeClass("endZoom");
            $("#zoomOut").addClass("endZoom");
        }
        else
        {
            $("#zoomIn, #zoomOut").removeClass("endZoom");
        }
    },

    moveStart: function(e)
    {
        this.ctx.moveTo(0, 0);
        var x = 0;
        var y = 0;
        if(e.type == "touchstart")
        {
            x = Math.round(e.targetTouches[0].pageX - this.canvas.getBoundingClientRect().left);
            y = Math.round(e.targetTouches[0].pageY - this.canvas.getBoundingClientRect().top);
        }
        else
        {
            x = (e.layerX)? e.layerX : e.offsetX;
            y = (e.layerY)? e.layerY : e.offsetY;
        }

        // The click/touch is on a favorite
        if(y <= 35)
        {
            if(!favorites) return;

            // The area of a favorite is about 40px wide
            var minFq = this.currentFrequency + (x - Math.round(this.canvas.width/2) - 20)*this.hertzPerPixel;
            var maxFq = this.currentFrequency + (x - Math.round(this.canvas.width/2) + 20)*this.hertzPerPixel;
            for(var i=0; i<favorites.length; i++)
            {
                if(favorites[i]["frequency"] >= minFq && favorites[i]["frequency"] <= maxFq)
                {
                    if(typeof playFavorite == "function") playFavorite(favorites[i]["id"]);
                    return;
                }
            }
        }

        this.dragging = true;
        this.dragStart = x;

        this.lastDragPos = null;
        this.lastDragTime = null;
        this.speed = null;

        if(this.moveInterval)
        {
            clearInterval(this.moveInterval);
            this.moveInterval = null;
        }

        if(this.timeout)
        {
            clearTimeout(this.timeout);
            this.timeout = null;
        }

    },

    move: function(e)
    {
        var x = 0;
        var y = 0;
        if(e.type == "touchmove")
        {
            x = Math.round(e.targetTouches[0].pageX - this.canvas.getBoundingClientRect().left);
            y = Math.round(e.targetTouches[0].pageY - this.canvas.getBoundingClientRect().top);
        }
        else
        {
            x = (e.layerX)? e.layerX : e.offsetX;
            y = (e.layerY)? e.layerY : e.offsetY;
        }

        if(!this.dragging || !this.dragStart)
        {
          // The mouse is on a favorite
          if(y <= 35)
          {
              if(!favorites) return;

              // The area of a favorite is about 40px wide
              var minFq = this.currentFrequency + (x - Math.round(this.canvas.width/2) - 20)*this.hertzPerPixel;
              var maxFq = this.currentFrequency + (x - Math.round(this.canvas.width/2) + 20)*this.hertzPerPixel;
              for(var i=0; i<favorites.length; i++)
              {
                  if(favorites[i]["frequency"] >= minFq && favorites[i]["frequency"] <= maxFq)
                  {
                      this.favoriteHovered = favorites[i]["id"];
                      this.draw(this.currentFrequency);
                      return;
                  }
              }
          }

          if(this.favoriteHovered >= 0)
          {
            this.favoriteHovered = -1;
            this.draw(this.currentFrequency);
          }

          return;
        }

        this.favoriteHovered = -1;

        if(this.timeout) clearTimeout(this.timeout);

        var d = new Date();
        var currentTime = d.getTime();
        if(this.lastDragPos && this.lastDragTime)
        {
            var posDiff = x - this.lastDragPos;
            var timeDiff = currentTime - this.lastDragTime;
            if(timeDiff <= 0) timeDiff = 1;
            this.speed = posDiff/timeDiff;
        }
        else
        {
            this.speed = 0;
        }

        this.lastDragPos = x;
        this.lastDragTime = currentTime;

        var diff = x - this.dragStart;
        var frequency = Math.round((this.currentFrequency - diff*this.hertzPerPixel)/this.hertzPerPixel)*this.hertzPerPixel;
        if(frequency <= MIN_FREQ) frequency = MIN_FREQ;
        else if(frequency >= MAX_FREQ) frequency = MAX_FREQ;

        this.draw(frequency);
        $("#frequency").val((Math.round(frequency/this.hertzPerPixel/10)*this.hertzPerPixel*10/1e6) + " MHz");
    },

    moveEnd: function(e)
    {
        if(!this.dragging || !this.dragStart) return;

        if(this.timeout) clearTimeout(this.timeout);
        this.timeout = null;

        var x = 0;
        if(e.type == "touchend")
        {
            x = this.lastDragPos;
        }
        else
        {
            x = (e.layerX)? e.layerX : e.offsetX;
        }

        var diff = x - this.dragStart;
        if(diff != 0)
        {
            var frequency = Math.round((this.currentFrequency - diff*this.hertzPerPixel)/this.hertzPerPixel)*this.hertzPerPixel;
            if(frequency <= MIN_FREQ) frequency = MIN_FREQ;
            else if(frequency >= MAX_FREQ) frequency = MAX_FREQ;

            this.currentFrequency = frequency;
            this.draw(this.currentFrequency);
            $("#frequency").val((Math.round(this.currentFrequency/this.hertzPerPixel/10)*this.hertzPerPixel*10/1e6) + " MHz");

            if(this.speed)
            {
                if(this.moveInterval) clearInterval(this.moveInterval);
                this.moveInterval = setInterval(this.runOut, 40);
            }
            else
            {
                frequency = Math.round(this.currentFrequency/this.hertzPerPixel/10)*this.hertzPerPixel*10;
                this.currentFrequency = frequency;
                this.draw(this.currentFrequency);
                $("#frequency").val((this.currentFrequency/1e6) + " MHz");

                this.timeout = setTimeout(this.setFreq, 700);
            }
        }

        this.dragging = false;
        this.dragStart = null;
        this.lastDragPos = null;
        this.lastDragTime = null;
    },

    runOut: function()
    {
        if(!tuner.speed)
        {
            if(tuner.moveInterval)
            {
                clearInterval(tuner.moveInterval);
                tuner.moveInterval = null;
            }

            var frequency = Math.round(tuner.currentFrequency/tuner.hertzPerPixel/10)*tuner.hertzPerPixel*10;
            if(frequency <= MIN_FREQ) frequency = MIN_FREQ;
            else if(frequency >= MAX_FREQ) frequency = MAX_FREQ;

            tuner.currentFrequency = frequency;
            tuner.draw(tuner.currentFrequency);
            $("#frequency").val((tuner.currentFrequency/1e6) + " MHz");

            tuner.timeout = setTimeout(tuner.setFreq, 700);
        }
        else
        {
            var diff = tuner.speed*40;
            var frequency = Math.round((tuner.currentFrequency - diff*tuner.hertzPerPixel)/tuner.hertzPerPixel)*tuner.hertzPerPixel;
            if(frequency <= MIN_FREQ)
            {
                frequency = MIN_FREQ;
                tuner.speed = 0;
            }
            else if(frequency >= MAX_FREQ)
            {
                frequency = MAX_FREQ;
                tuner.speed = 0;
            }

            tuner.currentFrequency = frequency;
            tuner.draw(frequency);
            $("#frequency").val((Math.round(tuner.currentFrequency/tuner.hertzPerPixel/10)*tuner.hertzPerPixel*10/1e6) + " MHz");

            if(tuner.speed > 0)
            {
                tuner.speed -= 0.2;
                if(tuner.speed < 0) tuner.speed = null;
            }
            else
            {
                tuner.speed += 0.2;
                if(tuner.speed > 0) tuner.speed = null;
            }
        }
    },

    setFreq: function()
    {
        setFrequency(tuner.currentFrequency);
        $("#frequency").val((tuner.currentFrequency/1e6) + " MHz");
    },

    draw: function(frequency)
    {
        if(!this.canvas || !this.ctx) return;

        this.drawBackground(this.canvas.width, this.canvas.height);
        this.drawPins(this.canvas.width, this.canvas.height, frequency);
        this.drawFavorites(this.canvas.width, this.canvas.height, frequency);
        this.drawMiddlePin(this.canvas.width, this.canvas.height);
    },

    drawBackground: function(width, height)
    {
        this.ctx.fillStyle = "#16272B";
        this.ctx.fillRect(0, 0, width,height);
    },

    drawPins: function(width, height, frequency)
    {
        var hertzPerPin = this.hertzPerPixel * 10;

        var hertzPerDigit = this.hertzPerPixel * 50;

        var fq = Math.floor((frequency - Math.floor(width/2)*this.hertzPerPixel)/hertzPerPin)*hertzPerPin;

        var x = 0;
        this.ctx.strokeStyle = this.enabled? "#ffffff" : "rgba(255, 255, 255, 0.5)";
        this.ctx.lineCap = "round";
        var lineHeight = 10;

        while(x <= width)
        {
            x = Math.floor(width/2) - (frequency - fq)/this.hertzPerPixel;

            if(fq >= MIN_FREQ && fq <= MAX_FREQ)
            {

                if(fq%(hertzPerPin*10) == 0)
                {
                    this.ctx.lineWidth = 3;
                    lineHeight = 20;
                }
                else if(fq%(hertzPerPin*5) == 0)
                {
                    this.ctx.lineWidth = 2;
                    lineHeight = 15;
                }
                else
                {
                    this.ctx.lineWidth = 2;
                    lineHeight = 10;
                }

                this.ctx.beginPath();
                this.ctx.moveTo(x, height);
                this.ctx.lineTo(x, height - lineHeight);
                this.ctx.stroke();

                if(fq%(hertzPerDigit) == 0)
                {
                    this.ctx.font = "16px Play";
                    this.ctx.fillStyle = this.enabled? "#ffffff" : "rgba(255, 255, 255, 0.5)";
                    this.ctx.textBaseline = "middle";
                    this.ctx.textAlign = "center";
                    this.ctx.fillText((fq/1e6).toString(), x, height - 20 - 10);
                }
            }

            fq += hertzPerPin;
        }
    },

    drawFavorites: function(width, height, frequency)
    {
        if(!favorites) return;

        var startFq = Math.floor(frequency - Math.floor(width/2)*this.hertzPerPixel);
        var endFq = Math.ceil(frequency + Math.ceil(width/2)*this.hertzPerPixel);

        var x = 0;
        for(var i=favorites.length-1; i>=0; i--)
        {
            if(favorites[i]["frequency"] >= startFq && favorites[i]["frequency"] <= endFq)
            {
                x = Math.floor(width/2) - (frequency - favorites[i]["frequency"])/this.hertzPerPixel;
                var img = new Image;
                img.src = "img/favorite.png";
                if(!this.enabled) this.ctx.globalAlpha = 0.5;
                this.ctx.drawImage(img, x-10, 0, 20, 20);
                this.ctx.globalAlpha = 1;

                this.ctx.font = "10px Questrial";
                if(this.enabled)
                {
                  this.ctx.fillStyle = this.favoriteHovered == favorites[i]["id"]? "rgb(255, 255, 255)" : "rgb(187, 187, 187)";
                }
                else this.ctx.fillStyle = this.enabled? ((this.favoriteHovered == favorites[i]["id"])? "rgb(255, 255, 255)" : "rgb(200, 200, 200)") : "rgba(255, 255, 255, 0.5)";
                this.ctx.textBaseline = "middle";
                this.ctx.textAlign = "center";
                var name = (favorites[i]["name"].length > 12)? favorites[i]["name"].substr(0, 12) + "..." : favorites[i]["name"];
                this.ctx.fillText(name, x, 20 + 7);
            }
        }
    },

    drawMiddlePin: function(width, height)
    {
        var middle = Math.round(width/2);
        this.ctx.strokeStyle = this.enabled? "rgba(255, 78, 80, 0.8)" : "rgba(255, 78, 80, 0.4)";
        this.ctx.lineWidth = 4;
        this.ctx.lineCap = "round";
        this.ctx.beginPath();
        this.ctx.moveTo(middle, 0);
        this.ctx.lineTo(middle, 60);
        this.ctx.stroke();
    }
}
