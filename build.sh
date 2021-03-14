#!/bin/bash
SCRIPTPATH="$( cd -- "$(dirname "BASH_SOURCE[0])")" > /dev/null 2>&1 ; pwd -P )"
electron-packager . PSDEe --platfor=linux --arch-x64 --electron-version=11.2.0
rm -R PSDEe-linux-x64/resources/app/
ln -s $SCRIPTPATH PSDEe-linux-x64/resources/app
