const { SlashCommandBuilder } = require('@discordjs/builders');

const fs = require('fs');
const snoowrap = require('snoowrap');
const envPath = '.env.json';
const dataJson = require('../../' + envPath);


const rClient = new snoowrap({
    userAgent: dataJson.auth.reddit.userAgent,
    clientId: dataJson.auth.reddit.clientID,
    clientSecret: dataJson.auth.reddit.clientSecret,
    username: dataJson.auth.reddit.username,
    password: dataJson.auth.reddit.password,
});

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mia')
        .setDescription('Checks on the newest chapter of Made in Abyss'),

    // checks if any of the stickied posts on /r/MadeInAbyss contain the
    // string for the new chapter number.
    async execute(interaction) {
        const numStickyPosts = 2;
        const chapterToCheck = dataJson.data.madeInAbyss.latestChapter;


        for (let i = 0; i < numStickyPosts; i++) {
            let stickyPost = await rClient.getSubreddit('MadeInAbyss')
                .getSticky({ num: i + 1 });
            let chapterToCheckAvailable = stickyPost.title
                .includes(chapterToCheck.toString());
            if (chapterToCheckAvailable) {
                await interaction.reply(
                    `Chapter ${chapterToCheck} available! ` +
                    `Link here: ${stickyPost.url}`);
                let miaChannel = await interaction.guild.channels.cache.get(
                    dataJson.data.madeInAbyss.channelID);
                const thread = await miaChannel.threads.create({
                    name: `Made in Abyss Chapter ${chapterToCheck} Discussion`,
                });

                dataJson.data.madeInAbyss.latestChapter++;

                fs.writeFile(
                    envPath,
                    JSON.stringify(dataJson, null, 4),
                    function writeJSON(err) {
                        if (err) {
                            return console.log(err);
                        }
                        console.log(JSON.stringify(dataJson));
                        console.log('writing to ' + envPath);
                    }
                );

                return;
            }
        }

        await interaction.reply(
            `Chapter ${chapterToCheck} is not available yet...`);
    },
};