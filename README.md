<h1 align="center">
  <img src="https://user-images.githubusercontent.com/2679513/131189167-18ea5fe1-c578-47f6-9785-3748178e4312.png" width="150px"/><br/>
  Speckle | PowerBI
</h1>
<h3 align="center">
    Data Connector and 3D Viewer Visual for PowerBI platform
</h3>
<p align="center"><b>Speckle</b> is the data infrastructure for the AEC industry.</p><br/>

<p align="center"><a href="https://twitter.com/SpeckleSystems"><img src="https://img.shields.io/twitter/follow/SpeckleSystems?style=social" alt="Twitter Follow"></a> <a href="https://speckle.community"><img src="https://img.shields.io/discourse/users?server=https%3A%2F%2Fspeckle.community&amp;style=flat-square&amp;logo=discourse&amp;logoColor=white" alt="Community forum users"></a> <a href="https://speckle.systems"><img src="https://img.shields.io/badge/https://-speckle.systems-royalblue?style=flat-square" alt="website"></a> <a href="https://speckle.guide/dev/"><img src="https://img.shields.io/badge/docs-speckle.guide-orange?style=flat-square&amp;logo=read-the-docs&amp;logoColor=white" alt="docs"></a></p>
<p align="center"></p>

# About Speckle

What is Speckle? Check our ![YouTube Video Views](https://img.shields.io/youtube/views/B9humiSpHzM?label=Speckle%20in%201%20minute%20video&style=social)

### Features

- **Object-based:** say goodbye to files! Speckle is the first object based platform for the AEC industry
- **Version control:** Speckle is the Git & Hub for geometry and BIM data
- **Collaboration:** share your designs collaborate with others
- **3D Viewer:** see your CAD and BIM models online, share and embed them anywhere
- **Interoperability:** get your CAD and BIM models into other software without exporting or importing
- **Real time:** get real time updates and notifications and changes
- **GraphQL API:** get what you need anywhere you want it
- **Webhooks:** the base for a automation and next-gen pipelines
- **Built for developers:** we are building Speckle with developers in mind and got tools for every stack
- **Built for the AEC industry:** Speckle connectors are plugins for the most common software used in the industry such as Revit, Rhino, Grasshopper, AutoCAD, Civil 3D, Excel, Unreal Engine, Unity, QGIS, Blender and more!

### Try Speckle now!

Give Speckle a try in no time by:

- [![app.speckle.systems](https://img.shields.io/badge/https://-speckle.xyz-0069ff?style=flat-square&logo=hackthebox&logoColor=white)](https://app.speckle.systems) ⇒ creating an account at our public server

### Resources

- [![Community forum users](https://img.shields.io/badge/community-forum-green?style=for-the-badge&logo=discourse&logoColor=white)](https://speckle.community) for help, feature requests or just to hang with other speckle enthusiasts, check out our community forum!
- [![website](https://img.shields.io/badge/tutorials-speckle.systems-royalblue?style=for-the-badge&logo=youtube)](https://speckle.systems) our tutorials portal is full of resources to get you started using Speckle
- [![docs](https://img.shields.io/badge/docs-speckle.guide-orange?style=for-the-badge&logo=read-the-docs&logoColor=white)](https://speckle.guide/dev/) reference on almost any end-user and developer functionality

![Untitled](https://user-images.githubusercontent.com/2679513/132021739-15140299-624d-4410-98dc-b6ae6d9027ab.png)

# Repo structure

This repo is the home to our Speckle 2.0 PowerBI project. The [Speckle Server](https://github.com/specklesystems/Server) is providing all the web-facing functionality and can be found [here](https://github.com/specklesystems/Server).

## Install

Go to the [Releases](https://github.com/specklesystems/speckle-powerbi/releases) page, downlad the `.mez` file of the latest release and copy it into the following folder in your computer:

```
YOUR_USER_FOLDER\Documents\Power BI Desktop\Custom Connectors\
```
If the folder doesn't exist, create it.

### Allow custom extensions to run

Go to `Settings -> Security -> Data Extensions` and activate the following option:

![Allow extensions to run](https://user-images.githubusercontent.com/2316535/130931149-074cf6a8-1910-41f1-99c7-b8b08168f473.png)

### Checking the connector is loaded

Now open PowerBI and you should see `Speckle (beta)` appear in the data source.

![PowerBI](https://user-images.githubusercontent.com/2316535/129580913-02e5e662-f344-419c-9894-e97055930c58.png)

## Usage

> More detailed instructions on how to use the connector will be added shortly!

### Current limitations

Chunked data currently is not automatically de-chunked when received, we are aware of this limitation and are working to resolve it!

## Developing & Debugging

We encourage everyone interested to debug / hack / contribute / give feedback to this project.

### Setup

#### Install PowerQuery SDK

Follow the instructions from the [official docs](https://docs.microsoft.com/en-us/power-query/installingsdk)

#### Build with Visual Studio

Every time you build the connector, VisualStudio will copy the latest `.mez` connector file to the appropriate location. Just restart PowerBI to see the latest changes.

#### Debug

You can start the PowerQuery connector in VisualStudio, this will open a standalone connector you can use for testing purposes.

We don't know of a way to debug the connector live in PowerBI, but we'd be happy to hear about it.
