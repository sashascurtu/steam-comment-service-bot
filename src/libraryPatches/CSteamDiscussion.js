const Cheerio = require('cheerio');
const SteamID = require('steamid');

const SteamCommunity = require('steamcommunity');
const Helpers = require('../../node_modules/steamcommunity/components/helpers.js');

const EDiscussionType = require("./EDiscussionType.js");


/**
 * Scrape a discussion's DOM to get all available information
 * @param {string} url - SteamCommunity url pointing to the discussion to fetch
 * @param {function} callback - First argument is null/Error, second is object containing all available information
 */
SteamCommunity.prototype.getSteamDiscussion = function(url, callback) {
	// Construct object holding all the data we can scrape
	let discussion = {
		id: null,
		type: null,
		appID: null,
		forumID: null,
		gidforum: null, // This is some id used as parameter 2 in post requests
		topicOwner: null, // This is some id used as parameter 1 in post requests
		author: null,
		postedDate: null,
		title: null,
		content: null,
		commentsAmount: null, // I originally wanted to fetch all comments by default but that would have been a lot of potentially unused data
		answerCommentIndex: null
	};

	// Get DOM of discussion
	this.httpRequestGet(url, (err, res, body) => {
		if (err) {
			callback(err);
			return;
		}

		try {

			/* --------------------- Preprocess output --------------------- */

			// Load output into cheerio to make parsing easier
			let $ = Cheerio.load(body);

			// Get breadcrumbs once. Depending on the type of discussion, it either uses "forum" or "group" breadcrumbs
			let breadcrumbs = $(".forum_breadcrumbs").children();

			if (breadcrumbs.length == 0) breadcrumbs = $(".group_breadcrumbs").children();

			// Steam redirects us to the forum page if the discussion does not exist which we can detect by missing breadcrumbs
			if (!breadcrumbs[0]) {
				callback(new Error('Discussion not found'));
				return;
			}


			/* --------------------- Find and map values --------------------- */

			// Determine type from URL as some checks will deviate, depending on the type
			if (url.includes("steamcommunity.com/discussions/forum"))     discussion.type = EDiscussionType.Forum;
			if (/steamcommunity.com\/app\/.+\/discussions/g.test(url))    discussion.type = EDiscussionType.App;
			if (/steamcommunity.com\/groups\/.+\/discussions/g.test(url)) discussion.type = EDiscussionType.Group;


			// Get appID from breadcrumbs if this discussion is associated to one
			if (discussion.type == EDiscussionType.App) {
				let appIdHref = breadcrumbs[0].attribs["href"].split("/");

				discussion.appID = appIdHref[appIdHref.length - 1];
			}


			// Get forumID from breadcrumbs
			let forumIdHref;

			if (discussion.type == EDiscussionType.Group) { // Groups have an extra breadcrumb so we need to shift by 2
				forumIdHref = breadcrumbs[4].attribs["href"].split("/");
			} else {
				forumIdHref = breadcrumbs[2].attribs["href"].split("/");
			}

			discussion.forumID = forumIdHref[forumIdHref.length - 2];


			// Get id, gidforum and topicOwner. The first is used in the URL itself, the other two only in post requests
			let gids = $(".forum_paging > .forum_paging_controls").attr("id").split("_");

			discussion.id = gids[4];
			discussion.gidforum = gids[3];
			discussion.topicOwner = gids[2];


			// Find postedDate and convert to timestamp
			let posted = $(".topicstats > .topicstats_label:contains(\"Date Posted:\")").next().text();

			discussion.postedDate = Helpers.decodeSteamTime(posted.trim());


			// Find commentsAmount
			discussion.commentsAmount = Number($(".topicstats > .topicstats_label:contains(\"Posts:\")").next().text());


			// Get discussion title & content
			discussion.title = $(".forum_op > .topic").text().trim();
			discussion.content = $(".forum_op > .content").text().trim();


			// Find comment marked as answer
			let hasAnswer = $(".commentthread_answer_bar")

			if (hasAnswer.length != 0) {
				let answerPermLink = hasAnswer.next().children(".forum_comment_permlink").text().trim();

				// Convert comment id to number, remove hashtag and subtract by 1 to make it an index
				discussion.answerCommentIndex = Number(answerPermLink.replace("#", "")) - 1;
			}


			// Find author and convert to SteamID object
			let authorLink = $(".authorline > .forum_op_author").attr("href");

			Helpers.resolveVanityURL(authorLink, (err, data) => { // This request takes <1 sec
				if (err) {
					callback(err);
					return;
				}

				discussion.author = new SteamID(data.steamID);

				// Make callback when ID was resolved as otherwise owner will always be null
				callback(null, new CSteamDiscussion(this, discussion));
			});

		} catch (err) {
			callback(err, null);
		}
	}, "steamcommunity");
}


/**
 * Constructor - Creates a new Discussion object
 * @class
 * @param {SteamCommunity} community
 * @param {{ id: string, appID: string, forumID: string, author: SteamID, postedDate: Object, title: string, content: string, commentsAmount: number }} data
 */
function CSteamDiscussion(community, data) {
	/**
	 * @type {SteamCommunity}
	 */
	this._community = community;

	// Clone all the data we received
	Object.assign(this, data);
}


/**
 * Scrapes a range of comments from this discussion
 * @param {number} startIndex - Index (0 based) of the first comment to fetch
 * @param {number} endIndex - Index (0 based) of the last comment to fetch
 * @param {function} callback - First argument is null/Error, second is array containing the requested comments
 */
CSteamDiscussion.prototype.getComments = function(startIndex, endIndex, callback) {
	this._community.getDiscussionComments(`https://steamcommunity.com/app/${this.appID}/discussions/${this.forumID}/${this.id}`, startIndex, endIndex, callback);
};


/**
 * Posts a comment to this discussion's comment section
 * @param {String} message - Content of the comment to post
 * @param {function} callback - Takes only an Error object/null as the first argument
 */
CSteamDiscussion.prototype.postComment = function(message, callback) {
	this._community.postDiscussionComment(this.topicOwner, this.gidforum, this.id, message, callback);
};


/**
 * Delete a comment from this discussion's comment section
 * @param {String} gidcomment - ID of the comment to delete
 * @param {function} callback - Takes only an Error object/null as the first argument
 */
CSteamDiscussion.prototype.deleteComment = function(gidcomment, callback) {
	this._community.deleteDiscussionComment(this.topicOwner, this.gidforum, this.id, gidcomment, callback);
};


/**
 * Subscribes to this discussion's comment section
 * @param {function} callback - Takes only an Error object/null as the first argument
 */
CSteamDiscussion.prototype.subscribe = function(callback) {
	this._community.subscribeDiscussionComments(this.topicOwner, this.gidforum, this.id, callback);
};


/**
 * Unsubscribes from this discussion's comment section
 * @param {function} callback - Takes only an Error object/null as the first argument
 */
CSteamDiscussion.prototype.unsubscribe = function(callback) {
	this._community.unsubscribeDiscussionComments(this.topicOwner, this.gidforum, this.id, callback);
};
