# miLight-adapter

This is a Mozilla WebThings Gateway adapter for the miLight WiFi controller and LED bulbs, also called Easybulb, Limitless, etc.

## Usage

This description takes into account that you are familiar with the miLight WiFi controller/bridge, the bulbs and their default smartphone app, plus that the bridge is already configured in your local network.
1. Using the app assign the bulbs to the zones as wanted
2. In the adapter config page you'll need to enter the IP and port of the bridge and the zone to which the bulb(s) is(are) assigned.
   For each zone you need the create an entry in the config, if you just want to control all zones from one WebThing, set the zone      to 0. Please note, that in case you have individual zones also, controlling the bulbs with the all zones WebThing the GUI elements of the other miLight WebThings will not be updated in the current version.

## Tested device

https://www.google.com/url?sa=i&rct=j&q=&esrc=s&source=images&cd=&ved=2ahUKEwi-2ubXxezmAhUSIlAKHXuSCGQQjRx6BAgBEAQ&url=https%3A%2F%2Fwww.amazon.de%2FMilight-WiFi-Receiver-Bridge-Controller%2Fdp%2FB00J66K0Q8&psig=AOvVaw2q651_PEUe3UTYXJtmajqS&ust=1578316607389176

