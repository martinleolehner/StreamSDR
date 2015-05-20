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


## @package radio
#  The radio module contains the GNU Radio application.
from gnuradio import gr
from gnuradio import analog
from gnuradio import blocks
from gnuradio import filter

import os
import sys
import ConfigParser
from pubsub import pub

import osmosdr
import streamsink


## A GNU Radio AM and FM receiver.
class Radio(gr.top_block):

    ## Constructor
    def __init__(self, config):
        gr.top_block.__init__(self, "Radio Top Block")

        # Variables
        self.volume = volume = 1

        self.input_samp_rate = input_samp_rate = 2e6
        self.output_samp_rate = output_samp_rate = 32000
        self.output_correction = output_correction = 0

        self.current_demodulation = "fm"
        self.frequency = frequency = 92e6

        # Read the stream configuration
        stream_bitrate = config.getint("stream", "bitrate")
        if not isinstance(stream_bitrate, int) or stream_bitrate < 8 or stream_bitrate > 320: stream_bitrate = 128

        stream_type = config.get("stream", "type")

        stream_address = config.get("stream", "address")
        stream_port = config.getint("stream", "feed_port")
        if not isinstance(stream_port, int) : stream_port = 8000 if stream_type == "icecast" else 8001

        stream_password = config.get("stream", "password")
        icecast_user = config.get("stream", "icecast_user")
        icecast_mountpoint = config.get("stream", "icecast_mountpoint")
        stream_name = config.get("stream", "stream_name")
        stream_genre = config.get("stream", "stream_genre")
        stream_url = config.get("stream", "stream_url")
        stream_description = config.get("stream", "stream_description")

        # Blocks
        self.rtlsdr_source = osmosdr.source( args="numchan=" + str(1) + " " + "" )
        #self.rtlsdr_source.set_clock_source("internal", 0)
        self.rtlsdr_source.set_sample_rate(input_samp_rate)
        self.rtlsdr_source.set_center_freq(frequency, 0)
        self.rtlsdr_source.set_freq_corr(0, 0)
        self.rtlsdr_source.set_dc_offset_mode(0, 0)
        self.rtlsdr_source.set_iq_balance_mode(0, 0)
        self.rtlsdr_source.set_gain_mode(False, 0)
        self.rtlsdr_source.set_gain(10, 0)
        self.rtlsdr_source.set_if_gain(20, 0)
        self.rtlsdr_source.set_bb_gain(20, 0)
        self.rtlsdr_source.set_antenna("", 0)
        self.rtlsdr_source.set_bandwidth(0, 0)

        self.fm_block = FmBlock(self.input_samp_rate, (output_samp_rate + output_correction))

        self.am_block = AmBlock(input_samp_rate, (output_samp_rate + output_correction))

        # Streamsink
        self.audio_sink = streamsink.streamsink(output_samp_rate, stream_bitrate, stream_type,
                stream_address, stream_port, stream_password,
                icecast_user, icecast_mountpoint)

        if stream_name: self.audio_sink.set_stream_name(stream_name)
        if stream_genre: self.audio_sink.set_stream_genre(stream_genre)
        if stream_url: self.audio_sink.set_stream_url(stream_url)
        if stream_description: self.audio_sink.set_stream_description(stream_description)

        # Connections
        self.connect(self.rtlsdr_source, self.fm_block, self.audio_sink)


    ## Sets the demodulation
    def set_demodulation(self, demodulation):
        if not isinstance(demodulation, basestring): return

        if demodulation.lower() == "am" and self.current_demodulation == "fm":
            print "Set demodulation to: " + str(demodulation.upper())
            self.lock()
            self.disconnect(self.fm_block)
            self.connect(self.rtlsdr_source, self.am_block, self.audio_sink)
            self.current_demodulation = "am"
            self.get_demodulation()
            self.unlock()
        elif demodulation.lower() == "fm" and self.current_demodulation == "am":
            print "Set demodulation to: " + str(demodulation.upper())
            self.lock()
            self.disconnect(self.am_block)
            self.connect(self.rtlsdr_source, self.fm_block, self.audio_sink)
            self.current_demodulation = "fm"
            self.get_demodulation()
            self.unlock()

    ## Sends the pubsub message current_demodulation and passes the current demodulation
    def get_demodulation(self):
        pub.sendMessage("current_demodulation", demodulation=self.current_demodulation)
        return self.current_demodulation

    ## Sets the frequency
    def set_frequency(self, frequency):
        if not isinstance(frequency, int) and not isinstance(frequency, float): return

        if frequency != self.frequency:
            print "Set frequnency to: " + str(frequency)
            self.frequency = frequency
            self.rtlsdr_source.set_center_freq(self.frequency, 0)

        self.get_frequency()

    ## Sends the pubsub message current_frequency and passes the current frequency
    def get_frequency(self):
        pub.sendMessage("current_frequency", frequency=self.frequency)
        return self.frequency


## A hierarchical block to demodulate a FM signal.
class FmBlock(gr.hier_block2):

    ## Constructor
    def __init__(self, input_samp_rate, output_samp_rate):
        gr.hier_block2.__init__(
                self, "FM Block",
                gr.io_signature(1, 1, gr.sizeof_gr_complex*1),
                gr.io_signature(1, 1, gr.sizeof_float*1),
        )

        # Parameters
        self.input_samp_rate = input_samp_rate
        self.output_samp_rate = output_samp_rate
        self.decimation = decimation = 4
        self.cutoff = cutoff = 100e3
        self.transition = transition = 10e3

        # Blocks
        self.rational_resampler_1 = filter.rational_resampler_ccc(
                interpolation=1,
                decimation=decimation,
                taps=None,
                fractional_bw=None,
        )

        self.low_pass_filter = filter.fir_filter_ccf(1, filter.firdes.low_pass(
        	1, int(input_samp_rate/decimation), cutoff, transition, filter.firdes.WIN_HAMMING, 6.76))

        self.fm_demodulator = analog.wfm_rcv(
                quad_rate=int(input_samp_rate/decimation),
                audio_decimation=1,
        )

        self.rational_resampler_2 = filter.rational_resampler_fff(
                interpolation=output_samp_rate,
                decimation=int(input_samp_rate/decimation),
                taps=None,
                fractional_bw=None,
        )

        self.multiply = blocks.multiply_const_vff((80,))

        # Connections
        self.connect(
                self,
                self.rational_resampler_1,
                self.low_pass_filter,
                self.fm_demodulator,
                self.rational_resampler_2,
                self.multiply,
                self
        )


## A hierarchical block to demodulate an AM signal.
class AmBlock(gr.hier_block2):

    ## Constructor
    def __init__(self, input_samp_rate, output_samp_rate):
        gr.hier_block2.__init__(
                self, "Am Block",
                gr.io_signature(1, 1, gr.sizeof_gr_complex*1),
                gr.io_signature(1, 1, gr.sizeof_float*1),
        )

        # Parameters
        self.input_samp_rate = input_samp_rate
        self.output_samp_rate = output_samp_rate
        self.internal_samp_rate = 50000

        # Blocks
        self.xlating_fir_filter = filter.freq_xlating_fir_filter_ccf(
                int(input_samp_rate/self.internal_samp_rate),
                (filter.firdes.low_pass_2(1, input_samp_rate, 25e3, 10e3, 40)),
                0,
                input_samp_rate)

        self.agc = analog.agc2_cc(1e-1, 1e-2, 1, 1)
        self.agc.set_max_gain(100)

        self.am_demodulator = analog.am_demod_cf(
            	channel_rate=self.internal_samp_rate,
            	audio_decim=1,
            	audio_pass=5000,
            	audio_stop=5500,
        )

        self.rational_resampler = filter.rational_resampler_fff(
                interpolation=output_samp_rate,
                decimation=self.internal_samp_rate,
                taps=None,
                fractional_bw=None,
        )

        # Connections
        self.connect(
                self,
                self.xlating_fir_filter,
                self.agc,
                self.am_demodulator,
                self.rational_resampler,
                self
        )
