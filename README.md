<h1 align="center">
  <img src="https://user-images.githubusercontent.com/2679513/131189167-18ea5fe1-c578-47f6-9785-3748178e4312.png" width="150px"/><br/>
  Speckle | Power BI
</h1>
<h3 align="center">
    Data Connector and 3D Viewer Visual for Power BI platform
</h3>
<p align="center"><b>Speckle</b> is the data infrastructure for the AEC industry.</p><br/>

<p align="center"><a href="https://twitter.com/SpeckleSystems"><img src="https://img.shields.io/twitter/follow/SpeckleSystems?style=social" alt="Twitter Follow"></a> <a href="https://speckle.community"><img src="https://img.shields.io/discourse/users?server=https%3A%2F%2Fspeckle.community&amp;style=flat-square&amp;logo=discourse&amp;logoColor=white" alt="Community forum users"></a> <a href="https://speckle.systems"><img src="https://img.shields.io/badge/https://-speckle.systems-royalblue?style=flat-square" alt="website"></a> <a href="https://speckle.guide/dev/"><img src="https://img.shields.io/badge/docs-speckle.guide-orange?style=flat-square&amp;logo=read-the-docs&amp;logoColor=white" alt="docs"></a></p>
<p align="center"></p>

Speckle Power BI Data Connector lets you easily get data from Speckle into Power BI reports and visualizations. You can access and analyze data from various AEC apps (like Revit, Archicad, Grasshopper, and more) and open-source files (IFC, STL, OBJ, etc.) into Power BI with ease. 

Speckle’s connection to Power BI consists of two parts:

- **Data Connector** fetches the data you uploaded from AEC apps to Speckle.
- **3D Visual** allows you to see those models in 3D within Power BI.

![Desktop - 1 (1)](https://github.com/specklesystems/speckle-powerbi/assets/51519350/6d2c5224-965f-4eae-b869-be26cb48c6b2)

# Repo Structure

This repo is home to our Power BI connector. The Speckle Server provides all the web-facing functionality and can be found [here](https://github.com/specklesystems/Server).

`src/powerbi-data-connector` contains all the code for the Data connector.

`src/powerbi-visual` contains all the code for 3D Visual.

# Installation

Speckle connector can be installed directly from [Manager for Speckle](https://speckle.systems/download/). Full instructions for [installation](https://speckle.guide/user/powerbi/installation.html) and [configuration](https://speckle.guide/user/powerbi/configuration.html) can be found on our docs.

# Using 3D Visual

3D Visual can be imported as any other Power BI custom visual.

1. Navigate to the Visualization Pane.
2. Click the three dots (…) and select “Import a visual from a file”.
3. Go to `Documents/Power BI Desktop/Custom Visuals` and import `Speckle 3D Visual.pbiviz` file.
4. Speckle cube will appear in the Visualization pane.

For more on how to use the visual, [check our docs](https://speckle.guide/user/powerbi-visual/introduction.html).

# Usage

To get started with Power BI connectors, please take a look at the [documentation](https://speckle.guide/user/powerbi/introduction.html) and extensive [tutorials](https://www.youtube.com/playlist?list=PLlI5Dyt2HaEsZHG2WJ75WIM0Brx6VHT2S) published. 

# **Developing & Debugging**

We encourage everyone interested to debug/hack/contribute/give feedback to this project.

## **Setup**

### **Install PowerQuery SDK**

Follow the instructions from the [official docs](https://docs.microsoft.com/en-us/power-query/installingsdk)

### **Build with Visual Studio**

Every time you build the connector, VisualStudio will copy the latest `.mez` connector file to the appropriate location. Just restart PowerBI to see the latest changes.

### **Debug**

You can start the PowerQuery connector in VisualStudio, this will open a standalone connector you can use for testing purposes.

We don't know of a way to debug the connector live in PowerBI, but we'd be happy to hear about it.


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

- [![speckle XYZ](https://img.shields.io/badge/https://-speckle.xyz-0069ff?style=flat-square&logo=hackthebox&logoColor=white)](https://speckle.xyz) ⇒ creating an account at our public server
- [![create a droplet](https://img.shields.io/badge/Create%20a%20Droplet-0069ff?style=flat-square&logo=digitalocean&logoColor=white)](https://marketplace.digitalocean.com/apps/speckle-server?refcode=947a2b5d7dc1) ⇒ deploying an instance in 1 click 

### Resources

- [![Community forum users](https://img.shields.io/badge/community-forum-green?style=for-the-badge&logo=discourse&logoColor=white)](https://speckle.community) for help, feature requests or just to hang with other speckle enthusiasts, check out our community forum!
- [![website](https://img.shields.io/badge/tutorials-speckle.systems-royalblue?style=for-the-badge&logo=youtube)](https://speckle.systems) our tutorials portal is full of resources to get you started using Speckle
- [![docs](https://img.shields.io/badge/docs-speckle.guide-orange?style=for-the-badge&logo=read-the-docs&logoColor=white)](https://speckle.guide/dev/) reference on almost any end-user and developer functionality

![Untitled](https://user-images.githubusercontent.com/2679513/132021739-15140299-624d-4410-98dc-b6ae6d9027ab.png)
