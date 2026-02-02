Hey Eric,

I took the weekend to look at the ECMWF climate data tender with Claude Code. I wanted to better understand the ask and the challenges therein. You can find the result at ecmwf.regexflow.com

So, I'm not saying I've cracked it or anything and I don't have the GIS skillset that you do, but with direction from the tender itself (Zarr/ARCO, DeckGL + React), maybe this project could be within our grasp? We'd still have to staff up for it, but if I can do this in a few days with Claude Code, imagine what you could do, never mind if we have someone on this full time (post-win) under you.

**Sites referenced in the tender:**
- [ERA Explorer](https://www.ecmwf.int/en/newsletter/183/news/dawn-new-era-explorer) - ECMWF's own ARCO Data Lake architecture (this is what they want us to build on)
- [Copernicus Data Visualisation](https://climate.copernicus.eu/data-visualisation) - their current approach to climate viz
- [deck.gl](https://deck.gl/) - specified WebGL rendering library
- [Zarr](https://zarr.dev/) - cloud-native chunked array format they require

**Technical decisions - from the tender vs our own:**

*Specified by ECMWF in the tender:*
- **Zarr/ARCO format** - cloud-native chunked arrays, works directly from blob storage
- **DeckGL + React** for frontend rendering
- **Their infrastructure** - importantly, ECMWF hosts the platform. We deliver the solution (optimised data + frontend), they provide compute, storage, and serving

*Decisions we made ourselves (would value your input):*
- **Multi-resolution pyramids** - pre-computed LOD levels (0-5) so the browser only loads what's needed at current zoom. Reduced ~100GB raw data to ~36GB processed
- **Static file architecture** - no backend server needed beyond nginx + blob storage. Keeps it simple and scalable
- **Web Mercator projection** for most datasets, **Polar Stereographic** for sea ice (so data renders over the Arctic, not the Atlantic)
- **Python pipeline** using xarray, rasterio, and Copernicus Climate Data Store API for data acquisition and processing

You won't be surprised that I didn't code any of this. It's all Claude and Claude Code, looking at the tender, looking at the sites they referenced, with me just guiding. Like I said, imagine what you could do.

**Key Dates:**

| Date | Event |
|------|-------|
| 20 Feb 2026 | Tender submission deadline |
| Q2 2026 | Expected contract award |
| 1 Jun 2026 | SC1 start (ideal) |
| 31 Oct 2026 | SC1 end |
| 1 Dec 2026 | SC2 start |
| 31 May 2028 | Contract end |

I think maybe we should go for it. Perhaps include this POC as part of the tender, moved to somewhere on Derilinx infrastructure, obviously. If we win it, staff up, safe knowing we have the contract(s).
