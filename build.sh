#!/bin/bash
SCRIPTPATH="$( cd -- "$(dirname "BASH_SOURCE[0])")" > /dev/null 2>&1 ; pwd -P )"
APPPATH="PSDEe-linux-x64/resources/app"
#npx electron-packager . PSDEe --platfor=linux --arch-x64 --electron-version=11.2.0
if [ -L "$APPPATH" ] && [ -d "$APPPATH" ]; then
    rm PSDEe-linux-x64/resources/app
elif [ -d "$APPPATH/" ]; then
    rm -R PSDEe-linux-x64/resources/app
elif [ -f "$APPPATH" ]; then
    rm PSDEe-linux-x64/resources/app
fi
ln -s $SCRIPTPATH $APPPATH
