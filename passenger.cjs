// Startup file for Phusion Passenger hosts (cPanel "Setup Node.js App", Plesk Node.js extension).
// Passenger loads CommonJS entry points; this hands over to the ESM server.
import("./server.js");
