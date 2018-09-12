const express = require("express");
const exphbs = require("express-handlebars");
const bodyParser = require("body-parser");
const logger = require("morgan");
const mongoose = require("mongoose");
const axios = require("axios");
const cheerio = require("cheerio");

// Require all models!
const Comment = require("./models/Comment");
const Article = require("./models/Article");

// Start Express
const app = express();

// Set up body-parser and logger
// Logger (or Morgan) is set up to generate logs automatically, we are choosing the "dev" pre-defined format
// Body parser extracts the entire body portion of an incoming request stream and exposes it on req.body
app.use(logger("dev"));
app.use(
  bodyParser.urlencoded({
    extended: true
  })
);

// Delivers the public folder to the user without it having to be generated, modified, or processed
app.use(express.static("public"));

// Set Handlebars
app.set("views", "./views");
app.engine(
  "hbs",
  exphbs({
    defaultLayout: "main",
    extname: ".hbs"
  })
);
app.set("view engine", ".hbs");

// Database configuration with mongoose
mongoose.connect("mongodb://localhost/scraper");
const db = mongoose.connection;

// Show any mongoose errors
db.on("error", function(error) {
  console.log("Mongoose Error: ", error);
});

// Shows log if connection is successful
db.once("open", function() {
  console.log("Mongoose connection successful.");
});

// ROUTES BELOW
app.get("/", function(req, res) {
  Article.find({})
    .then(function(response) {
      // Sets the response to an object for handlebars to use
      const hbObject = {
        articles: response
      };
      console.log("Handlesbars Object: " + hbObject);
      res.render("index", hbObject);
    })
    .catch(function(err) {
      // If an error occurred, send it to the client
      res.json(err);
    });
});

app.get("/scrape", function(req, res) {
  axios.get("https://slashdot.org/").then(function(response) {
    const $ = cheerio.load(response.data);
    $("article[id]").each(function(i, element) {
      let result = {};
      result.title = $(element)
        .find("h2 span.story-title a")
        .text();
      result.link = $(element)
        .find("h2 span.story-title a")
        .attr("href");
      result.summary = $(element)
        .find("div.p")
        .text()
        .trim();
      Article.update(
        { title: result.title },
        result,
        { new: true, upsert: true, setDefaultsOnInsert: true },
        function(err, doc) {
          if (err) {
            console.log("Error:", err);
          }
        }
      );
    });
    // Load the results on the page! :D
    res.redirect("/");
  });
});

// Adds or removes articles
app.post("/save/:route/:id", function(req, res) {
  if (req.params.route === "index") {
    req.params.route = "";
  }

  Article.findOneAndUpdate(
    { _id: req.params.id },
    { saved: req.body.saved }
  ).then(function(error, doc) {
    if (err) {
      console.log(error);
    } else {
      console.log("doc", doc);
      res.redirect("/" + req.params.route);
    }
  });
});

// Get all saved items
app.get("/saved", function(req, res) {
  Article.find({ saved: true })
    .populate("comments")
    .sort({ dateCreated: 1 })
    .exec(function(err, doc) {
      if (err) {
        console.log(err);
      } else {
        console.log(doc);
        var hbObject = {
          articles: doc
        };
        console.log("hbObject:", hbObject);
        res.render("saved", hbObject);
      }
    });
});

// Add or replace a comment
app.post("/comment/:id", function(req, res) {
  let newComment = new Comment(req.body);
  newComment.save(function(error, doc) {
    if (error) {
      console.log(error);
    } else {
      Article.findOneAndUpdate(
        { _id: req.params.id },
        { $push: { comments: doc._id } },
        { new: true }
      ).then(function(err, doc) {
        if (err) {
          console.log(err);
        } else {
          res.redirect("/saved");
        }
      });
    }
  });
});

// Start Server! :D
const PORT = process.env.PORT || 3000;

app.listen(PORT, function() {
  console.log("Server listening on: http://localhost:" + PORT);
});