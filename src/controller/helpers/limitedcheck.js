/*
 * File: limitedcheck.js
 * Project: steam-comment-service-bot
 * Created Date: 09.07.2021 16:26:00
 * Author: 3urobeat
 * 
 * Last Modified: 29.09.2021 18:00:55
 * Modified By: 3urobeat
 * 
 * Copyright (c) 2021 3urobeat <https://github.com/HerrEurobeat>
 * 
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>. 
 */



/**
 * Checks all accounts in botobject if they are limited and returns amount of limited accounts and amount of failed checks
 * @param {Object} botobject The botobject
 * @param {function} [callback] Called with `limitedaccs` (Number) and `failedtocheck` (Number) parameters on completion
 */
module.exports.check = (botobject, callback) => {
    var limitedaccs = 0
    var failedtocheck = 0

    try {
        for (var i = 0; i < Object.keys(botobject).length; i++) { //iterate over all accounts in botobject

            if (botobject[Object.keys(botobject)[i]].limitations != undefined && botobject[Object.keys(botobject)[i]].limitations.limited != undefined) { //if it should be undefined for what ever reason then rather don't check instead of crash the bot
                if (botobject[Object.keys(botobject)[i]] != undefined && botobject[Object.keys(botobject)[i]].limitations.limited == true) limitedaccs++ //yes, this way to get the botobject key by iteration looks stupid and is probably stupid but it works and is "compact" (not really but idk)
            } else { 
                //logger("error", `failed to check if bot${i} is limited. Showing account in startup message as unlimited...`, false, true); //removed as of now to remove confusion and the message below already shows how many couldn't be checked
                failedtocheck++ 
            }

            if (Number(i) + 1 == Object.keys(botobject).length && limitedaccs > 0) { //all accounts checked
                callback(limitedaccs, failedtocheck)
            }
        }
    } catch (err) {
        logger("error", `Error in limited checker: ${err}`)

        callback(limitedaccs, failedtocheck)
    }
}