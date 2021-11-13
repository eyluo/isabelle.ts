export { };

const fs = require('fs');

const { Client, Collection, Intents } = require('discord.js');
const dataJson = require('../.env.json');

const allIntents = new Intents(32767);
const withOptions = {
    intents: allIntents,
}

let client = new Client(withOptions);

let commands = new Collection();
const commandFiles = fs.readdirSync('./src/commands')
    .filter(file => file.endsWith('.ts'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    // Set a new item in the Collection
    // With the key as the command name and the value as the exported module
    if (command.data) {
        commands.set(command.data.name, command);
    }
}

// When the client is ready, run this code (only once)
client.once('ready', () => {
    console.log('isabelle.ts is ready to roll!');
});

client.on('messageCreate', async message => {
    if (message.content.toLowerCase().includes('ozen') &&
        !message.content.toLowerCase().includes('ozen the immovable sovereign')) {
        message.lineReply(`Hi ${message.author}, it looks like you just ` +
            `invoked the name of Ozen the Immovable Sovereign without ` +
            `addressing her by her full title. Please address her as ` +
            `such otherwise I\'m going to break your kneecaps!`)
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const command = commands.get(interaction.commandName);

    if (!command) return;

    try {
        await (command as any).execute(interaction);
    } catch (error) {
        console.error(error);
        await interaction.reply({
            content: 'There was an error while executing this command!',
            ephemeral: true
        });
    }
});

client.login(dataJson.auth.discord.token);