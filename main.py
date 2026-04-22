import os
import webview
import sys
from api import Api


try:
    sys.stdout.write('Testing stdout: õ\n') # Not very elegant, but it's the simplest way to know if a valid stdout exists.
    sys.stdout.flush()
except Exception:
    nullFile = open(os.devnull, 'w', encoding='utf-8')
    sys.stdout = nullFile
    sys.stderr = nullFile


if __name__ == '__main__':
    api = Api()
    if(len(sys.argv) > 1):
        api.addToInitQueue(sys.argv[1:])

    api.createMainWindow()
    webview.start(api.setupDOM)

#python -m PyInstaller main.spec