#!/bin/bash

# Detect the operating system
if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    # Windows
    .\.venv\Scripts\activate
else
    # MacOS/Linux
    source .venv/bin/activate
fi

# Run the main script
python main.py 