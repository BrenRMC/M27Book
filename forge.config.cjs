const path = require("node:path");

const appIcon = path.join(__dirname, "assets", "madden27-sportsbook.ico");
const setupIcon = path.join(__dirname, "assets", "madden27-sportsbook-setup.ico");

module.exports = {
  packagerConfig: {
    name: "Madden27-Sportsbook",
    executableName: "Madden27-Sportsbook",
    productName: "Madden 27 Sportsbook",
    icon: appIcon,
    win32metadata: {
      CompanyName: "Madden 27 Sportsbook",
      FileDescription: "Madden 27 Franchise Sportsbook",
      InternalName: "Madden27-Sportsbook",
      OriginalFilename: "Madden27-Sportsbook.exe",
      ProductName: "Madden 27 Sportsbook"
    }
  },

  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "madden27sportsbook",
        authors: "Madden 27 Sportsbook",
        description: "Madden 27 Franchise Sportsbook",
        setupExe: "Madden27-Sportsbook-1.7.04-Setup.exe",
        setupIcon,
        title: "Madden 27 Sportsbook",
        noMsi: true,
        skipUpdateIcon: false
      }
    }
  ]
};
