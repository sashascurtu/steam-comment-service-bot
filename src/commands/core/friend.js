/*
 * File: friend.js
 * Project: steam-comment-service-bot
 * Created Date: 2021-07-09 16:26:00
 * Author: 3urobeat
 *
 * Last Modified: 2023-12-27 14:07:36
 * Modified By: 3urobeat
 *
 * Copyright (c) 2021 - 2023 3urobeat <https://github.com/3urobeat>
 *
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
 */


const SteamID = require("steamid");

const CommandHandler = require("../commandHandler.js"); // eslint-disable-line


module.exports.addFriend = {
    names: ["addfriend"],
    description: "Adds the ID with all bot accounts. Requires unlimited accounts!",
    args: [
        {
            name: "ID",
            description: "The link, steamID64 or vanity of the profile to add",
            type: "string",
            isOptional: false,
            ownersOnly: true
        }
    ],
    ownersOnly: true,

    /**
     * The addFriend command
     * @param {CommandHandler} commandHandler The commandHandler object
     * @param {Array} args Array of arguments that will be passed to the command
     * @param {function(object, object, string): void} respondModule Function that will be called to respond to the user's request. Passes context, resInfo and txt as parameters.
     * @param {object} context The context (this.) of the object calling this command. Will be passed to respondModule() as first parameter.
     * @param {CommandHandler.resInfo} resInfo Object containing additional information your respondModule might need to process the response (for example the userID who executed the command).
     */
    run: async (commandHandler, args, respondModule, context, resInfo) => {
        let respond = ((txt) => respondModule(context, resInfo, txt)); // Shorten each call
        let requesterID = resInfo.userID;

        if (commandHandler.controller.info.readyAfter == 0) return respondModule(context, { prefix: "/me", ...resInfo }, await commandHandler.data.getLang("botnotready", null, requesterID)); // Check if bot isn't fully started yet - Pass new resInfo object which contains prefix and everything the original resInfo obj contained

        if (!args[0]) return respond(await commandHandler.data.getLang("invalidprofileid", null, requesterID));

        commandHandler.controller.handleSteamIdResolving(args[0], "profile", async (err, res) => {
            if (err) return respond((await commandHandler.data.getLang("invalidprofileid", null, requesterID)) + "\n\nError: " + err);

            // Check if first bot account is limited to be able to display error message instantly
            if (commandHandler.controller.main.user.limitations && commandHandler.controller.main.user.limitations.limited == true) {
                respond(await commandHandler.data.getLang("addfriendcmdacclimited", { "profileid": res }, requesterID));
                return;
            }

            respond(await commandHandler.data.getLang("addfriendcmdsuccess", { "profileid": res, "estimatedtime": 5 * commandHandler.controller.getBots().length }, requesterID));
            logger("info", `Adding friend ${res} with all bot accounts... This will take ~${5 * commandHandler.controller.getBots().length} seconds.`);

            commandHandler.controller.getBots().forEach((e, i) => {
                // Check if this bot account is limited
                if (e.user.limitations && e.user.limitations.limited == true) {
                    logger("error", `Can't add friend ${res} with bot${e.index} because the bot account is limited.`);
                    return;
                }

                if (e.user.myFriends[res] != 3 && e.user.myFriends[res] != 1) { // Check if provided user is not friend and not blocked
                    setTimeout(() => {
                        e.user.addFriend(new SteamID(res), (err) => {
                            if (err) logger("error", `Error adding ${res} with bot${e.index}: ${err}`);
                                else logger("info", `Added ${res} with bot${e.index} as friend.`);
                        });

                        commandHandler.controller.friendListCapacityCheck(e, (remaining) => { // Check remaining friendlist space
                            if (remaining < 25) logger("warn", `The friendlist space of bot${e.index} is running low! (${remaining} remaining)`);
                        });
                    }, 5000 * i);
                } else {
                    logger("warn", `bot${e.index} is already friend with ${res} or the account was blocked/blocked you.`); // Somehow logs steamIDs in separate row?!
                }
            });
        });
    }
};


module.exports.unfriend = {
    names: ["unfriend"],
    description: "Unfriends a user from all logged in accounts. (Owner only) Providing no argument will let all bots unfriend you. (Available to normal users)",
    args: [
        {
            name: "ID",
            description: "The link, steamID64 or vanity of the profile to unfriend",
            type: "string",
            isOptional: true, // If not provided all bots will unfriend the requesting user
            ownersOnly: false
        }
    ],
    ownersOnly: false,

    /**
     * The unfriend command
     * @param {CommandHandler} commandHandler The commandHandler object
     * @param {Array} args Array of arguments that will be passed to the command
     * @param {function(object, object, string): void} respondModule Function that will be called to respond to the user's request. Passes context, resInfo and txt as parameters.
     * @param {object} context The context (this.) of the object calling this command. Will be passed to respondModule() as first parameter.
     * @param {CommandHandler.resInfo} resInfo Object containing additional information your respondModule might need to process the response (for example the userID who executed the command).
     */
    run: async (commandHandler, args, respondModule, context, resInfo) => {
        let respond = ((txt) => respondModule(context, resInfo, txt)); // Shorten each call
        let requesterID = resInfo.userID;

        if (commandHandler.controller.info.readyAfter == 0) return respondModule(context, { prefix: "/me", ...resInfo }, await commandHandler.data.getLang("botnotready", null, requesterID)); // Check if bot isn't fully started yet - Pass new resInfo object which contains prefix and everything the original resInfo obj contained

        // Check for no args again as the default behavior from above might be unavailable when calling from outside of the Steam Chat
        if (!args[0] && !resInfo.fromSteamChat) return respond(await commandHandler.data.getLang("noidparam", null, requesterID));

        // Unfriend message sender with all bot accounts if no id was provided and the command was called from the steam chat
        if (!args[0] && resInfo.userID && resInfo.fromSteamChat) {
            respond(commandHandler.data.getLang("unfriendcmdsuccess", null, requesterID));
            logger("info", `Removing friend ${resInfo.userID} from all bot accounts...`);

            commandHandler.controller.getBots().forEach((e, i) => {
                setTimeout(() => {
                    e.user.removeFriend(new SteamID(resInfo.userID));
                }, 1000 * i);
            });

        } else {

            // Get the correct ownerid array for this request
            let owners = commandHandler.data.cachefile.ownerid;
            if (resInfo.ownerIDs && resInfo.ownerIDs.length > 0) owners = resInfo.ownerIDs;

            // Unfriending a specific user is owner only
            if (!owners.includes(resInfo.userID)) return respond(await commandHandler.data.getLang("commandowneronly", null, requesterID));

            commandHandler.controller.handleSteamIdResolving(args[0], "profile", async (err, res) => {
                if (err) return respond((await commandHandler.data.getLang("invalidprofileid", null, requesterID)) + "\n\nError: " + err);
                if (commandHandler.data.cachefile.ownerid.includes(res)) return respondModule(context, { prefix: "/me", ...resInfo }, await commandHandler.data.getLang("idisownererror", null, requesterID)); // Check for the "original" ownerid array here, we don't care about non Steam IDs

                commandHandler.controller.getBots().forEach((e, i) => {
                    setTimeout(() => {
                        e.user.removeFriend(new SteamID(res));
                    }, 1000 * i); // Delay every iteration so that we don't make a ton of requests at once
                });

                respond(await commandHandler.data.getLang("unfriendidcmdsuccess", { "profileid": res }, requesterID));
                logger("info", `Removed friend ${res} from all bot accounts.`);
            });
        }
    }
};


module.exports.unfriendall = {
    names: ["unfriendall"],
    description: "Unfriends everyone with all bot accounts",
    args: [
        {
            name: '"abort"',
            description: "Aborts a unfriendall request if it did not start yet",
            type: "string",
            isOptional: true,
            ownersOnly: true
        }
    ],
    ownersOnly: true,

    /**
     * The unfriendall command
     * @param {CommandHandler} commandHandler The commandHandler object
     * @param {Array} args Array of arguments that will be passed to the command
     * @param {function(object, object, string): void} respondModule Function that will be called to respond to the user's request. Passes context, resInfo and txt as parameters.
     * @param {object} context The context (this.) of the object calling this command. Will be passed to respondModule() as first parameter.
     * @param {CommandHandler.resInfo} resInfo Object containing additional information your respondModule might need to process the response (for example the userID who executed the command).
     */
    run: async (commandHandler, args, respondModule, context, resInfo) => {
        let respond = ((txt) => respondModule(context, resInfo, txt)); // Shorten each call
        let requesterID = resInfo.userID;

        if (commandHandler.controller.info.readyAfter == 0) return respondModule(context, { prefix: "/me", ...resInfo }, await commandHandler.data.getLang("botnotready", null, requesterID)); // Check if bot isn't fully started yet - Pass new resInfo object which contains prefix and everything the original resInfo obj contained

        // TODO: This is bad. Rewrite using a message collector, maybe add one to steamChatInteraction helper
        var abortunfriendall; // eslint-disable-line no-var

        if (args[0] == "abort") {
            respond(await commandHandler.data.getLang("unfriendallcmdabort", null, requesterID));
            return abortunfriendall = true;
        }

        abortunfriendall = false;
        respond(await commandHandler.data.getLang("unfriendallcmdpending", { cmdprefix: resInfo.cmdprefix }, requesterID));

        setTimeout(async () => {
            if (abortunfriendall) return logger("info", "unfriendall process was aborted.");
            respondModule(context, { prefix: "/me", ...resInfo }, await commandHandler.data.getLang("unfriendallcmdstart", null, requesterID)); // Pass new resInfo object which contains prefix and everything the original resInfo obj contained
            logger("info", "Starting to unfriend everyone...");

            for (let i = 0; i < commandHandler.controller.getBots().length; i++) {
                for (let friend in commandHandler.controller.getBots()[i].user.myFriends) {
                    try {
                        setTimeout(() => {
                            let friendSteamID = new SteamID(String(friend));

                            if (!commandHandler.data.cachefile.ownerid.includes(friend)) { // Check for the "original" ownerid array here, we don't care about non Steam IDs
                                logger("info", `Removing friend ${friendSteamID.getSteamID64()} from all bot accounts...`, false, false, logger.animation("loading"));
                                commandHandler.controller.getBots()[i].user.removeFriend(friendSteamID);
                            } else {
                                logger("debug", `unfriendAll(): Friend ${friendSteamID.getSteamID64()} seems to be an owner, skipping...`, false, false, logger.animation("loading"));
                            }
                        }, 1000 * i); // Delay every iteration so that we don't make a ton of requests at once
                    } catch (err) {
                        logger("error", `[Bot ${i}] unfriendall error unfriending ${friend}: ${err}`);
                    }
                }
            }
        }, 30000);
    }
};
