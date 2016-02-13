# Imagesegmenter -- webapp for segmenting and tagging images

This is essentially a drawing app that can be used to hand-segment an image. It allows the user to use polygon, freehand contours, and a brush to edit the segmentation map, which can then be stored as a PNG or in Matlab format. Features include a file browser, unlimited undo and redo, named segment tags, and smoothing for contours.

This was created as part of a joint theoretical neuroscience research project between the City University of New York and the University of Pennsylvania.

## Requirements

The app has two components: a server component written in Python using Flask, and a client component written in Javascript and making light use of jQuery (for Ajax). For now the app has only been tested locally, in a setting in which both client and server run on the same computer. It should be straightforward to get to work on two different machines, but not much thought has been put into security issues.

Python requirements:
  - version 2.x (>= 2.6) or 3.x
  - NumPy + SciPy
  - Flask

Browser requirements:
  - tested on Chrome 48, Safari 9, Firefox 44 on Mac, Windows, Linux (a few features don't work on all browsers)

The app generates 5-6 full-size canvases, so if working on large images, the memory requirements can be quite large (for an 18MP image, *each* of the canvases takes up about 70MB of memory). Undo levels are stored uncompressed, but only for the rectangular portion of image that was modified. 

## Installation

You first need to get Python, Flask, NumPy, and SciPy. The easiest way to do this is to install a distribution such as Anaconda (https://www.continuum.io/downloads) or WinPython (http://winpython.github.io). Other options can be found for example at http://www.scipy.org/install.html. (If Flask doesn't come with your distribution, it is easy to install using `pip install Flask` or `pip install Flask3` from a command line, depending on whether you're using Python 2.x or 3.x). See more platform-specific instructions below.

You can then just start the server by running the `segmenter_sever.py` script. The app can be accessed at http://localhost:5000/.

## Installation on Mac

The advantage of installing a distribution such as Anaconda is that it's straightforward and you get a complete Python development environment, including several GUIs and lots of packages. The disadvantage is that all of this takes a lot of space (1-2GB), which might not be what you want if you're only using Python for running the image segmenter.

An alternative is to install one of the package managers available for the Mac, such as Homebrew (http://brew.sh/) or Macports (https://www.macports.org/). With these you can easily install all the packages you need without all the bells and whistles of a full distribution.

## Installation on Windows

For Windows, there aren't really any good package managers to use, but you can install the components one by one.
  * Get Python from https://www.python.org/downloads/. Make sure to select the "Add python.exe to the Path" option when installing Python.
  * Get NumPy from https://sourceforge.net/projects/numpy/files/NumPy/ (currently only versions 1.10.2 and earlier have Windows installers).
  * Get SciPy from https://sourceforge.net/projects/scipy/files/scipy/.

You can choose either version 2.x or 3.x of Python, but make sure you make consistent choices for all the packages.

Finally, you can get Flask by running a Terminal (Windows+R and type "cmd" in the window that opens), and running `pip install Flask` or `pip install Flask3` in it. Use the latter if you've installed Python 3.x. If this complains that `pip` cannot be found, then you may need to run the command in the directory where your Python executables are installed. Consult the documentation to figure out where that is.

Having installed Python, NumPy, SciPy, and Flask, you can download and unzip the image segmenter from GitHub, and double-click the `segmenter_server` script to run the server. The webapp can be accessed from a browser at `localhost:5000`, just like on Unix machines. Note that Internet Explorer 8 or older will not work -- please upgrade to a newer version, or install another browser, such as Google Chrome or Mozilla Firefox.

## Using the app

Point your browser to http://localhost:5000/. This loads a very simple file browser that you can use to navigate to where the images you're interested in are located. Click on an image and the actual segmentation app starts.

Inside the app, note that the name of the file that's being edited is shown on top, with the resolution of the image in gray shown next to it.

### Navigating the image

Standard controls can be used to navigate through the image:
  * mouse wheel scrolls (or two-finger scrolls on computers that support them) move around in the image (except in the zoom-to-fit state that is the default)
  * pinch gestures (when supported) or mouse wheel scrolls while the `CTRL` key is pressed zoom in and out around the current location of the mouse
  * scrolling can also be achieved using the arrow keys
  * zooming can also be achieved using `=` or `+` for zooming in and `-` for zooming out
  * another way to zoom is by using the zoom icons at the bottom-right of the image, or by entering a zoom amount (`53%` or `53` both work)
  * pressing the `0` key zooms the image so that it fits inside the segmenter's canvas
  * pressing the `1` key zooms into the image to its full size (so that each displayed pixel matches an image pixel)

### Editing the mask

There are two tools that can be used: a mixed polygon/freehand tool and a brush tool.

#### Polygon/freehand tool

A click starts drawing, and every new click adds a new segment to the polygon. Clicking and dragging adds a freehand portion. To finish drawing, you can hit `ESCAPE` to cancel the selection, or hit `ENTER` to close the curve and fill it with the current tag color (see below). The curve can also be closed using a double click, or if the final point drawn is very close to the starting point.

The curve can be smoothed before it is filled, on a scale that is configurable using the slider located on the right of the tool icons. A scale of 0 (no smoothing) is not recommended as this can result in jagged edges for freehand contours if these are drawn while zoomed out.

#### Brush tool

To fine-tune the tag masks, the brush tool can be used. The slider located on the right of the tool icon or the keys `[` and `]` can be used to change the size of the brush, which is also indicated by the shape of the mouse cursor.

#### The tags

Tags are used to identify the segments in the figure. They have a name and an associated color. The app starts off with two tags
  * the `eraser`, which is a special tag that can be used to erase parts of the mask
  * a tag called `foreground`

Select a tag by clicking on it (either the name or the color swatch work).

To rename a tag, double click on its name (this won't work for the eraser).

To add a tag, click the `+` button below the last tag. It is not currently possible to delete a tag (though you can remove all of its pixels from the segmentation).

#### Undo/redo

Unlimited undo and redo are possible (limits do in fact exist -- currently set to 1024 levels and at most 280 million pixels used, amounting to a gigabyte of memory on a typical system). Use the back and forward icons on the bottom of the canvas, or CTRL/Command + Z, CTRL/Command + SHIFT + Z to undo or redo, respectively. For the brush tool, all the changes made to the figure from the moment the mouse button is pressed until it is released are considered one edit, and are undone/redone together.

### Saving to file

Press the floppy-disk icon on the bottom-left of the canvas to save the segmentation. This can take a second or two. The name of the file where the segmentation is saved is obtained by removing the extension from the image file and adding `\_segmented` and an extension (see below) to it. This is saved in the same folder as the original image.

#### Matlab format

By default, the app saves the segmentation as a Matlab file containing two variables:
  * `tags` -- a cell array with the names of the tags
  * `segmentation` -- an integer matrix of the same size as the image, in which each element indicates which of the tags the corresponding pixel belongs to (with zeros indicating regions that were not tagged).

The file extension in this case is `.mat`.

#### PNG format

By pressing the settings icon in the bottom-right of the canvas, you can choose a different saving method: as a PNG file. The app actually creates two files:
  * a text file, with extension `.txt`, containing the mapping between pixel colors and tags; this is of the form:

        foreground: #FF0000
        object1: #0000FF
        object2: #00FF00
        object3: #B08000
        object4: #FFFF00

  * an image file in PNG format, with extension `.png`, storing the segmentation.

### Tricks

1. Remember that the segmentation is a single canvas. That means that if you have overlapping objects, you can select the lower one first, and then draw the top one over it.

2. Sometimes the image is hard to see, especially if some tags have already been drawn on top of it. Here are a few keyboard shortcuts that can help:
  * pressing `s` will hide or show the segmentation
  * pressing `i` will invert the colors in the image
  * pressing `b` will brighten the image

## Suggestions?

The app needs lots more testing -- please use the issue tracker to report any bugs, or features that would be nice to have.
