#!/usr/bin/env python

# Copyright 2015 Martin Lehner - Hes-so Valais / Wallis
#
# This file is part of StreamSDR
#
# StreamSDR is free software; you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation; either version 3, or (at your option)
# any later version.
#
# StreamSDR is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with StreamSDR. If not, see <http://www.gnu.org/licenses/>.


## @package server
#  The server module contains the Tornado webserver and WebSocket.
import tornado.ioloop
import tornado.web
import tornado.websocket

import threading
import re
import json
import urlparse
import time
import os
import ConfigParser
from pubsub import pub


lock = threading.Lock()

static_dir = os.path.dirname(os.path.realpath(__file__)) + "/static/"


## The tornado web server, running in a seperate thread.
class WebServer(threading.Thread):

    ## The static client list.
    clients = []

    last_connectivity = time.time()
    operator_ip = ""
    web_server_port = 8888
    stream_address = ""
    stream_port = 8000
    stream_location = "/;"

    ## Constructor.
    def __init__(self, config):
        threading.Thread.__init__(self)

        self._stop = threading.Event()

        # Get the webservers port
        port = config.getint("webserver", "port")
        if not isinstance(port, int): port = 8888
        WebServer.web_server_port = port

        # Get the stream host address
        stream_address = config.get("stream", "address")
        if stream_address != "localhost" and stream_address != "127.0.0.1": WebServer.stream_address = stream_address

        # Get the stream port
        stream_port = config.getint("stream", "stream_port")
        if not isinstance(stream_port, int): stream_port = 8000
        WebServer.stream_port = stream_port

        # Get the stream location, the mountpoint for Icecast or "/;" for SHOUTcast
        icecast_mountpoint = config.get("stream", "icecast_mountpoint")
        if icecast_mountpoint and icecast_mountpoint[0] != "/": icecast_mountpoint += "/"
        WebServer.stream_location = icecast_mountpoint if config.get("stream", "type") == "icecast" else "/;"

    ## Starts the server.
    def run(self):
        application.listen(WebServer.web_server_port)
        self.check_client_connection()
        tornado.ioloop.IOLoop.instance().start()

    ## Stops the server.
    def stop_server(self):
        self._stop.set()
        tornado.ioloop.IOLoop.instance().stop()

    # Adds a client to the static list of clients.
    @staticmethod
    def add_client(client):
        lock.acquire()
        if WebServer.clients:
            if WebServer.clients[0].request.remote_ip != WebServer.operator_ip and client.request.remote_ip == WebServer.operator_ip:
                WebServer.clients.insert(0, client)
            else:
                WebServer.clients.append(client)
        else:
            WebServer.clients.append(client)
            WebServer.operator_ip = client.request.remote_ip
        lock.release()

    ## Removes a client from the static list of clients.
    @staticmethod
    def remove_client(client):
        lock.acquire()
        try:
            WebServer.clients.remove(client)
        except ValueError, e:
            print "Could not remove client"
            pass
        lock.release()

    ## Checks if the operator client is alive and closes the connection if the client was inactive too long
    def check_client_connection(self):
        if not self._stop.is_set():
            if WebServer.clients:
                message = {"request" : "connection_alive"}
                message = json.dumps(message)
                WebServer.clients[0].write_message(message)

                if time.time() - WebServer.last_connectivity > 15:
                    print "Disconnect client "+WebServer.clients[0].request.remote_ip+", not responging."
                    lock.acquire()
                    WebServer.clients[0].close()
                    WebServer.clients.pop(0)
                    lock.release()

                    # Notify the first client in the list that he is the new operator client
                    WebServer.notify_operator()
                    WebServer.last_connectivity = time.time()
            threading.Timer(3, self.check_client_connection).start()

    ## Resets the operators ip
    @staticmethod
    def reset_operator_ip():
        if WebServer.clients:
            WebServer.operator_ip = WebServer.clients[0].request.remote_ip
        else:
            WebServer.operator_ip = ""

        WebServer.notify_operator()

    ## Notifies the first client in the list that he is the new operator client.
    @staticmethod
    def notify_operator(first=False):
        lock.acquire()
        if WebServer.clients and WebServer.clients[0].request.remote_ip == WebServer.operator_ip:
            message_obj = {"notification" : "operator",
                    "args": { "first" : first }}
            message = json.dumps(message_obj)
            WebServer.clients[0].write_message(message)
        else:
            WebServer.operator_ip = ""
        lock.release()

    ## Sends the current demodulation to all clients
    @staticmethod
    def current_demodulation(demodulation):
        lock.acquire()
        if WebServer.clients:
            message = {
                    "notification" : "current_demodulation",
                    "args": {"demodulation": demodulation}}
            message = json.dumps(message)
            for client in WebServer.clients:
                client.write_message(message)
        lock.release()

    ## Sends the current frequency to all clients
    @staticmethod
    def current_frequency(frequency):
        lock.acquire()
        if WebServer.clients:
            message = {
                    "notification" : "current_frequency",
                    "args": {"frequency": frequency}}
            message = json.dumps(message)
            for client in WebServer.clients:
                client.write_message(message)
        lock.release()


## This class handles the WebSocket connections.
class WebSocketHandler(tornado.websocket.WebSocketHandler):

    ## Allows all connections.
    def check_origin(self, origin):
        return True

    ## Handles a new connection.
    def open(self):
        print "Client "+ self.request.remote_ip +" connected"
        WebServer.add_client(self)

        # Notify the client that he is the admin client
        if self == WebServer.clients[0]:
            WebServer.last_connectivity = time.time()
            WebServer.notify_operator(True)

        # Notify the clients about the current demodulation and frequency
        pub.sendMessage("get_demodulation")
        pub.sendMessage("get_frequency")

    ## Handles messages.
    def on_message(self, message_string):
        # Only the first connected client can execute commands
        if not WebServer.clients or not self == WebServer.clients[0]:
            return

        if message_string:
            try:
                message = json.loads(message_string)
            except ValueError, e:
                print "Message is not in json format"
                return

            if "command" in message:
                if message["command"] == "set_frequency":
                    frequency = message["args"]["frequency"]
                    if isinstance(frequency, int):
                        pub.sendMessage("set_frequency", frequency=frequency)

                elif message["command"] == "set_demodulation":
                    demodulation = message["args"]["demodulation"]
                    if demodulation:
                        pub.sendMessage("set_demodulation", demodulation=demodulation)
            elif "notification" in message:
                if message["notification"] == "alive":
                    WebServer.last_connectivity = time.time()

    ## Handles the closing of a connection.
    def on_close(self):
        print "Client "+ self.request.remote_ip +" disconnected"
        WebServer.remove_client(self)

        # Reset the operators ip in 3 seconds
        threading.Timer(3, WebServer.reset_operator_ip).start()


## RequestHandler for the main (index) file.
class MainHandler(tornado.web.RequestHandler):

    # Renders the index file.
    def get(self, *args):
        # Compse the websocket and the stream url
        hostname = urlparse.urlparse("%s://%s" %(self.request.protocol, self.request.host)).hostname
        stream_address = WebServer.stream_address if WebServer.stream_address != "" else hostname
        wsUrl = "ws://" + hostname + ":" + str(WebServer.web_server_port) + "/ws"
        streamUrl = "http://" + stream_address + ":" + str(WebServer.stream_port) + WebServer.stream_location

        try:
            self.render(static_dir+"index.html",
                    wsUrl=wsUrl,
                    streamUrl=streamUrl)
        except IOError, e:
            self.clear()
            self.set_status(404, "Not found")
            try:
                self.render(
                        static_dir+"error.html",
                        errorCode=404,
                        title="Not found",
                        errorMessage="The index page could not be found.")
            except IOError, e:
                self.write("<h1>404 - Not found</h1>The index page could not be found.")


## RequestHandler for images.
class ImageHandler(tornado.web.RequestHandler):

    ## Renders the image
    def get(self, filename, suffix, *args):
        try:
            f = open(static_dir+filename+suffix, "r")
            s = f.read()
            f.close()
            suffix = suffix.lower()
            if suffix == ".png":
                self.set_header("Content-type", "image/png")
            elif suffix == ".jpg" or suffix == ".jpeg":
                self.set_header("Content-type", "image/jpeg")
            elif suffix == ".ico":
                self.set_header("Content-type", "image/vnd.microsoft.icon")
            else:
                self.clear()
                self.set_status(500, "File suffix of image is not png, jpg or jpeg.")
                self.write("<h1>500 - Internal Server Error</h1>File suffix of image \""+filename+suffix+"\" is not png, jpg or jpeg.")
                self.finish()
                return
            self.set_header("Content-length", len(s))
            self.write(s)

        except IOError, e:
            self.clear()
            self.set_status(404, "Not found")
            try:
                self.render(
                        static_dir+"error.html",
                        errorCode=404,
                        title="Not found",
                        errorMessage="The requested image \""+filename+suffix+"\" could not be found.")
            except IOError, e:
                self.write("<h1>404 - Not found</h1>The requested image \""+filename+suffix+"\" could not be found.")


## RequestHandler for .woff and .woff2 font files.
class WoffHandler(tornado.web.RequestHandler):

    ## Renders the font file.
    def get(self, filename, suffix, *args):
        try:
            f = open(static_dir+filename+suffix, "r")
            s = f.read()
            f.close()
            suffix = suffix.lower()

            if suffix == ".woff2":
                self.set_header("Content-Type", "application/font-woff2")
            else:
                self.set_header("Content-Type", "application/font-woff")
            self.write(s)
        except IOError, e:
            self.clear()
            self.set_status(404, "Not found")
            try:
                self.render(
                        static_dir+"error.html",
                        errorCode=404,
                        title="Not found",
                        errorMessage="The requested font \""+filename+suffix+"\" could not be found.")
            except IOError, e:
                self.write("<h1>404 - Not found</h1>The requested font \""+filename+suffix+"\" could not be found.")


## RequestHandler for all other files.
class StaticHandler(tornado.web.RequestHandler):

    ## Renderst the static file.
    def get(self, request):
        try:
            if re.search(r"(.*)\.js$", request):
                self.set_header("Content-Type", "text/javascript")
            elif re.search(r"(.*)\.css$", request):
                self.set_header("Content-Type", "text/css")

            self.render(static_dir+request)
        except IOError, e:
            self.clear()
            self.set_status(404, "Not found")
            try:
                self.render(
                        static_dir+"error.html",
                        errorCode=404,
                        title="Not found",
                        errorMessage="The requested resource \""+request+"\" could not be found.")
            except IOError, e:
                self.write("<h1>404 - Not found</h1>The requested resource \""+request+"\" could not be found.")


## The Tornado web application.
application = tornado.web.Application([
    (r"/ws", WebSocketHandler),
    (r"/(index(\.html)?)?", MainHandler),
    (r"/error.html", tornado.web.RedirectHandler, dict(url=r"/")),
    (r"/(.+)(\.(png|jpeg|jpg|ico))$", ImageHandler),
    (r"/(.+)(\.(woff|woff2))$", WoffHandler),
    (r"/(.*)", StaticHandler),
])
