StreamSDR
=========
A GNURadio application which can receive AM or FM signals and stream the received audio to a web interface.
Dependencies

Dependencies
------------
GNURadio, osmosdr, gr-streamsink, Tornado Web Server and pypubsub must
be installed.

- http://gnuradio.org/
- http://sdr.osmocom.org/trac/wiki/rtl-sdr
- https://github.com/martinleolehner/gr-streamsink
- http://www.tornadoweb.org/en/stable/
- http://pubsub.sourceforge.net/

Usage
-----
- You must have a SHOUTcast or Icecast server running and a rtl-sdr device connected to your computer.
- Modify the config file (streamsdr.conf) to fit to the settings of the streaming server.
- Then execute the streamsdr script
  - $ ./streamsdr [config_file]

If the webserver port in streamsdr.conf is set to 80 or your rtl-sdr device requires root privileges you must run the command as root.
