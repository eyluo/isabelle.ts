import { Events, Message } from 'discord.js';

export const name = Events.MessageCreate;

export async function execute(message: Message): Promise<void> {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();

  if (content.includes('ozen') && !content.includes('ozen the immovable sovereign')) {
    await message.reply(
      `Hi ${message.author.toString()}, it looks like you just ` +
        `invoked the name of Ozen the Immovable Sovereign without ` +
        `addressing her by her full title. Please address her as ` +
        `such. Otherwise, I'm going to break your kneecaps!`,
    );
  }
}
