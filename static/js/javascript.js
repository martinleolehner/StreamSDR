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

var useLocalStorage = false;
var websocket = null;

var MIN_FREQ = 24e6;
var MAX_FREQ = 1850e6;
var PROGRESS_DURATION = 4500;

var currentFrequency = 92e6;
var currentDemodulation = "fm";
var frequencySetTimer = null;
var favorites = [];
var currentFavorite = -1;
var favortiteSaveTimer = null;

var operator = false;

$(document).ready(function()
{
    // Check if HTML5 local storage is available
    useLocalStorage = localStorageAvailable();

    // Initialize the tuner
    var tunerZoom = parseInt(getData("tunerZoom"));
    if(!tunerZoom) tunerZoom = 4;
    tuner.init(currentFrequency, tunerZoom);

    // Add the resize handler
    $(window).resize(resizeComponents);
    resizeComponents();

    // Initialize the websocket
    initWebSocket();

    // Get the favorites
    favorites = getFavorites();
    if(favorites.length > 0)
    {
        var tableRows = "";
        for(var i=0; i<favorites.length; i++)
        {
            tableRows += createFavoriteTableRow(favorites[i]["name"], favorites[i]["id"],
                        favorites[i]["frequency"], favorites[i]["demodulation"]);
        }
        $("#favoriteTable tbody").html(tableRows);
    }
    else $("#favoriteTable thead td").html("No Favorites, click the heart on the top right to add a favorite.");

    if(favorites.length >= 2) $("#favoriteTable thead td").html("Drag and drop to reorder.");

    $("#favoriteTable tbody").sortable({
        start: favoriteDragStart,
        stop: updateFavoriteIndex
    }).disableSelection();

    // Initialize the audio player
    var volume = getData("volume");
    if(!volume) volume = 0.5;
    audioPlayer.init(volume);
    $("#volume").val(volume*100);

    // Redraw canvas in 0.5s when google fonts are loaded
    setTimeout("tuner.draw(currentFrequency)", 500);
});

//
function connected(isConnected)
{
    if(isConnected)
    {
        if(operator == true) updateStatus("Connected");
        else updateStatus("You are connected but not able to change the frequency as another client is already connected.");
        $("#reconnectImg").hide();
        $("#connectedImg").show();
    }
    else
    {
        updateStatus("Disconnected");
        $("#connectedImg").hide();
        $("#reconnectImg").show();

        operator = false;
        $("#wrapper").addClass("noOperator");
        $("#frequency").prop("disabled", true);
        tuner.disable();
    }
}

// Prints the status
function updateStatus(status)
{
    $("#status").html(replaceHtmlEntities(status));
}

// Resizes the tuner and sets the font size of the frequency
function resizeComponents()
{
    var contentWidth = $("#content").width();
    $("#tuner").attr("width", contentWidth*tuner.pixelRatio);
    $("#tuner").attr("height", 80*tuner.pixelRatio);
    $("#tuner").width(contentWidth);
    //$("#tuner").height(80);
    tuner.draw(currentFrequency);

    if($("#frequency").width() < 220) $("#frequency").css({ "font-size" : "32px", "padding-top" : "8px" });
    else $("#frequency").css({ "font-size" : "48px", "padding-top" : "0px" });
}

// Reconnects the websocket
function reconnect()
{
    if(websocket)
    {
        websocket.close();
        websocket = null;
    }

    initWebSocket();
}

// Initializes the websocket
function initWebSocket()
{
    try
    {
        if(typeof MozWebSocket == "function") WebSocket = MozWebSocket;

        if(websocket && websocket.readyState == 1) websocket.close();

        websocket = new WebSocket(wsUri);

        websocket.onopen = function() { connected(true); };

        websocket.onclose = function() { connected(false); };

        websocket.onmessage = function(evt) { handleMessage(evt.data); }

        websocket.onerror = function(evt)
        {
            updateStatus("An eror occured:" + evt.data);
        }
    }
    catch (exception)
    {
        updateStatus("Could not connect.\n" + exception);
    }
}

// Handles messages sent from the server
function handleMessage(message)
{
    var message = JSON.parse(message);

    // Notifications
    if(message.hasOwnProperty("notification"))
    {
        if(message["notification"] == "current_demodulation")
        {
            demodulation = message["args"]["demodulation"];
            if(typeof demodulation == "string")
            {
                currentDemodulation = demodulation;
                $("#demodulationTable td").removeClass("selected");
                $("#"+demodulation).addClass("selected");
                checkFavorite();
            }
        }
        else if(message["notification"] == "current_frequency")
        {
            frequency = message["args"]["frequency"];
            if(typeof frequency == "number")
            {
                currentFrequency = frequency;
                tuner.currentFrequency = frequency;
                tuner.draw(currentFrequency);
                frequency /= 1e6;
                $("#frequency").val(frequency + " MHz");
                checkFavorite();
            }
        }
        else if(message["notification"] == "operator")
        {
            if(operator) return;

            operator = true;

            $("#frequency").prop("disabled", false);
            tuner.enable();

            $("#wrapper").removeClass("noOperator");

            if(message.hasOwnProperty("args")
                && message["args"].hasOwnProperty("first")
                && message["args"]["first"] == true)
            {
                updateStatus("Connected");
            }
            else updateStatus("You are now able to change the frequency");
        }
    }
    else if(message.hasOwnProperty("request"))
    {
        if(message["request"] == "connection_alive")
        {
            var message = {"notification": "alive"};
            websocket.send(JSON.stringify(message));
        }
    }
}

// Inserts the frequency in MHz into the input field
function insertFrequency(inputField)
{
    inputField.value = currentFrequency/1e6;
}

// Checks if a valid frequency is entered
function frequencyEntered(frequency, e)
{
    /*if(frequencySetTimer) clearTimeout(frequencySetTimer);
    frequencySetTimer = null;*/

    var re = /^[0-9]+\.?[0-9]*$/g;
    if(!re.test(frequency))
    {
        if(e.type == "blur" || (e.keyCode? e.keyCode : e.charCode) == 13)
        {
            $("#frequency").val(currentFrequency/1e6 + " MHz");
            if(e.type != "blur") $("#frequency").trigger("blur");
        }
    }
    else
    {
        frequency = 1e6*parseFloat(frequency);
        if(frequency <= MIN_FREQ) frequency = MIN_FREQ;
        else if(frequency >= MAX_FREQ) frequency = MAX_FREQ;

        if((e.keyCode? e.keyCode : e.charCode) == 13)
        {
            $("#frequency").trigger("blur")
        }
        else if(e.type == "blur")
        {
            $("#frequency").val((frequency/1e6) + " MHz");
            if(frequency != currentFrequency) setFrequency(frequency);
        }
        /*else
        {
            frequencySetTimer = setTimeout(function(){ $("#frequency").trigger("blur"); }, 4000);
        }*/
    }

}

// Sets the frequency
function setFrequency(frequency)
{
    if(!operator) return;

    if(typeof frequency == "number")
    {
        var message = {
            "command": "set_frequency",
            "args": {"frequency": frequency}};
        websocket.send(JSON.stringify(message));

        tuner.draw(frequency);

        if(frequency != currentFrequency) startProgressAnimation();
    }
}

// Sets the demodulation
function setDemodulation(demodulation)
{
    if(!operator) return;

    if(typeof demodulation == "string")
    {
        var message = {
            "command": "set_demodulation",
            "args": {"demodulation": demodulation}};
        websocket.send(JSON.stringify(message));

        if(demodulation != currentDemodulation) startProgressAnimation();
    }
}

// Starts an animation to show the user that the frequency or demodulation is being set
function startProgressAnimation()
{
    $("#progress").stop().width("0px").css("border-top-right-radius", "0").fadeIn(0).animate({
        width: "100%"
    },
    {
        duration: PROGRESS_DURATION,
        complete: function() {
            $(this).css("border-top-right-radius", "2px").fadeOut(1000);
        }
    });
}

// Gets the saved favorites
function getFavorites()
{
    var favs = localStorage.getItem("favorites");
    if(!favs) return [];

    try
    {
        favs = JSON.parse(favs);
    }
    catch(e)
    {
        return [];
    }

    return favs;
}

// Sets a fixed width to all rows in the favorite table on dragging
function favoriteDragStart(e, ui)
{
    var maxWidth = [];
    $("tr", ui.item.parent()).each(function()
    {
        $("td", this).each(function(i)
        {
            if(i >= maxWidth.length) maxWidth.push(0);
            if($(this).width() > maxWidth[i]) maxWidth[i] = $(this).width();
        });
    });

    $("tr", ui.item.parent()).each(function()
    {
        $("td", this).each(function(i) { $(this).width(maxWidth[i]); });
    });
}

// Updates the index of the favorites when finished dragging
function updateFavoriteIndex(e, ui)
{
    $("tr", ui.item.parent()).each(function (i)
    {
        // Get the id number from the id attribute
        var id = $(this).attr("id").substr(9);
        if(!isNaN(id))
        {
            for(var j=0; j<favorites.length; j++)
            {
                // Set the new index
                if(favorites[j]["id"] == id) favorites[j]["index"] = i;
            }
        }
    });

    writeFavorites();

    // Remove the fixed width of all rows
    $("td", ui.item.parent()).each(function(){
        $(this).width("auto");
    });
};

// Plays a favorite
function playFavorite(id, e)
{
    if(!operator) return;

    if(typeof e != "undefined" && e.target.tagName != "TD" && e.target.tagName != "TR") return;

    for(var i=0; i<favorites.length; i++)
    {
        if(favorites[i]["id"] == id)
        {
            setFrequency(favorites[i]["frequency"]);
            setDemodulation(favorites[i]["demodulation"]);
            tuner.draw(favorites[i]["frequency"]);
            return;
        }
    }
}

// Checks if a favorite is currently played
function checkFavorite()
{
    currentFavorite = -1;
    var name = "";
    for(var i=0; i<favorites.length; i++)
    {
        if(currentFrequency == favorites[i]["frequency"]
            && currentDemodulation == favorites[i]["demodulation"])
        {
            currentFavorite = favorites[i]["id"];
            name = favorites[i]["name"];
            break;
        }
    }

    if(currentFavorite == -1)
    {
        $("#favoriteBox").html("<img src='img/emptyHeart.png' id='saveFavorite' onclick='addFavorite()' width='30' height='30' alt='Add Favorite'>");
    }
    else
    {
        $("#favoriteBox").html("<img src='img/favorite.png' id='saveFavorite' onclick='removeFavorite("+currentFavorite+")' width='30' height='30' alt='Remove Favorite'><br><input type='text' class='currentFavorite' id='currentFavorite' value='"+name+"' "+
            //"onkeydown='renameFavorite("+currentFavorite+", this.value, event)' "+
            "onkeyup='renameFavorite("+currentFavorite+", this.value, event)' "+
            "onblur='renameFavorite("+currentFavorite+", this.value, event)'>");
    }

}

// Saves the favorites
function writeFavorites()
{
    favorites.sort(function(a,b) {return a["index"]-b["index"]});

    var favs = JSON.stringify(favorites);
    setData("favorites", favs);

    checkFavorite();
}

// Adds a favorite
function addFavorite()
{
    var id = 0;
    for(var i=0; i<favorites.length; i++)
    {
        if(favorites[i]["id"] >= id) id = favorites[i]["id"]+1;
    }

    var name = currentDemodulation.toUpperCase() + " " +
                (currentFrequency/1e6) + " MHz";
    favorites.push({
        "id" : id,
        "name" : name,
        "frequency" : currentFrequency,
        "demodulation" : currentDemodulation,
        "index" : favorites.length});

    writeFavorites();

    var tableRow = createFavoriteTableRow(name, id,
                    currentFrequency, currentDemodulation);

    $("#favoriteTable tbody").append(tableRow);

    if(favorites.length >= 2) $("#favoriteTable thead td").html("Drag and drop to reorder.");
    else $("#favoriteTable thead td").html("");

    tuner.draw(currentFrequency);

    $("#currentFavorite").select();
}

// Renames a favorite
function renameFavorite(id, name, e)
{
    /*if(e.type == "keydown")
    {
        if(favortiteSaveTimer) clearTimeout(favortiteSaveTimer);
        favortiteSaveTimer = null;
        return;
    }*/

    /*if(favortiteSaveTimer) clearTimeout(favortiteSaveTimer);
    favortiteSaveTimer = null;*/

    for(var i=0; i<favorites.length; i++)
    {
        if(favorites[i]["id"] == id)
        {
            //favorites[i]["name"] = name;

            //
            if($(e.target).is("#currentFavorite")) $("#favorite_"+favorites[i]["id"]+" .favoriteName").val(name);
            else if(currentFavorite == id) $("#currentFavorite").val(name);

            if((e.keyCode? e.keyCode : e.charCode) == 13)
            {
                if($(e.target).hasClass("favoriteName")) $("#favorite_"+favorites[i]["id"]+" .favoriteName").trigger("blur");
                else $("#currentFavorite").trigger("blur");
            }
            else if(e.type == "blur" || (e.keyCode? e.keyCode : e.charCode) == 13)
            {
                if(name == favorites[i]["name"]) return;

                if(name == "")
                {
                    name = favorites[i]["demodulation"].toUpperCase() + " " + (favorites[i]["frequency"]/1e6) + " MHz";
                    $("#currentFavorite").val(name);
                    $("#favorite_"+favorites[i]["id"]+" .favoriteName").val(name);
                }

                favorites[i]["name"] = name;

                writeFavorites();
            }
            /*else
            {
                favortiteSaveTimer = setTimeout(function()
                {
                    $("#favoriteTable input").each(function() { this.blur(); });
                }, 5000);
            }*/
        }
    }

    tuner.draw(currentFrequency);
}

// Removes a favorite
function removeFavorite(id)
{
    for(var i=0; i<favorites.length; i++)
    {
        if(favorites[i]["id"] == id)
        {
            favorites.splice(i, 1);

            writeFavorites();

            var tableRow = $("#favorite_"+id);
            if(tableRow.is("tr")) tableRow.remove();

            if(favorites.length == 0) $("#favoriteTable thead td").html("No Favorites, click the heart on the top right to add a favorite.");
            else if(favorites.length >= 2) $("#favoriteTable thead td").html("Drag and drop to reorder.");
            else $("#favoriteTable thead td").html("");
        }
    }

    tuner.draw(currentFrequency);
}

// Creates a table row for the favorite table
function createFavoriteTableRow(name, id, fq, dm)
{
    return "<tr id='favorite_"+id+"' onclick='playFavorite("+id+", event)'>"+
        "<td><input type='text' class='favoriteName' value='"+name+"' "+
            //"onkeydown='renameFavorite("+id+", this.value, event)' "+
            "onkeyup='renameFavorite("+id+", this.value, event)' "+
            "onblur='renameFavorite("+id+", this.value, event)'></td>"+
        "<td class='dm'>"+dm.toUpperCase()+"</td>"+
        "<td>"+(fq/1e6)+" MHz</td>"+
        "<td><img src='img/play.png' width='20' height='20' alt='Play'"+
            "onclick='playFavorite("+id+")'>"+
            "<img src='img/remove.png' class='removeImg' width='20' height='20' alt='Remove' "+
            "onclick='removeFavorite("+id+")'></td>"+
    "</tr>";
}

// Checks if local storage is available
function localStorageAvailable()
{
    var x = "CheckForLocalStorage";
    try
    {
        localStorage.setItem(x, x);
        localStorage.removeItem(x);
        return true;    // If setting and removing an item succeeds, local storage is available
    }
    catch(e)
    {
        return false;   // If an exception is thrown, local storage isn't available
    }
}

// Sets a cookie or local storage
function setData(name, value, days)
{
    if(useLocalStorage) localStorage.setItem(name, value);  // Set a local storage item
    else
    {
        if(typeof days != "number") days = 365;    // Default value for expiration date
        var d = new Date();
        d.setTime(d.getTime() + 365*24*60*60*1000);
        var ms = "expires=" + d.toUTCString();
        document.cookie = name + "=" + value + "; " + ms;   // Set the cookie
    }

}

// Gets a cookie or a local storage item
function getData(name)
{
    if(useLocalStorage) return localStorage.getItem(name);  // Get the local storage item
    else
    {
        var a = document.cookie.split(";");
        for(var i=0; i<a.length; i++)
        {
            var x = a[i];
            x.trim();
            if(x.indexOf(name+"=") == 0) return x.substring(name.length + 1);   // Get the cookie
        }
    }
    return null;
}

// Replaces special characters new lines
function replaceHtmlEntities(text)
{
    // Replace special characters and new line with html break tag
    text = text.replace(/[\u00A0-\u9999<>\&]/gim,
        function(c){return '&#'+c.charCodeAt(0)+';';}
    ).replace(/(\r\n|\r|\n)/gm, "<br>");
    return text;
}
