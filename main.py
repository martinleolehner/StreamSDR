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


## @package main
#  The main module controls the radio and the server modules.

#from optparse import OptionParser
#from gnuradio import eng_notation
#from gnuradio.eng_option import eng_option
import signal
import time
import os
import sys
import ConfigParser
from pubsub import pub

from server import WebServer
from radio import Radio

## Controller class.
#
#  Sets up the radio receiver and the webserver.
class Controller:
    terminate = False

    def __init__(self):

        config_file = os.path.dirname(os.path.realpath(__file__))+"/streamsdr.conf"
        if not os.path.isfile(config_file):
            print "Error: Could not find the configuration file " + config_file + "\nPlease create this file."
            sys.exit(0)

        config = ConfigParser.RawConfigParser()
        config.read(config_file)

        web_server = WebServer(config)

        radio = Radio(config)

        # Connections between the webserver and the radio reciever
        pub.subscribe(radio.set_demodulation, "set_demodulation")
        pub.subscribe(radio.set_frequency, "set_frequency")

        pub.subscribe(radio.get_demodulation, "get_demodulation")
        pub.subscribe(radio.get_frequency, "get_frequency")

        pub.subscribe(web_server.current_demodulation, "current_demodulation")
        pub.subscribe(web_server.current_frequency, "current_frequency")

        # Start the webserver, it runs in a seperate thread
        web_server.start()

        # Start the radio reciever
        radio.start()

        # Connect the SIGINT signal
        signal.signal(signal.SIGINT, Controller.signal_handler)

        while not Controller.terminate:
            time.sleep(2)

        web_server.stop_server()

        radio.stop()
        radio.wait()


    @staticmethod
    def signal_handler(signal, frame):
        print "Terminate"
        Controller.terminate = True


if __name__ == '__main__':
    #parser = OptionParser(option_class=eng_option, usage="%prog: [options]")
    #(options, args) = parser.parse_args()

    controller = Controller()
