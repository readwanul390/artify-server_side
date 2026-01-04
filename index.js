
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();


app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://artify-client-side.netlify.app",
    ],
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  })
);



app.use(express.json());


const port = process.env.PORT || 3000;
const mongoUri = process.env.MONGO_URI || process.env.DB_URI;

mongoose
  .connect(mongoUri, { dbName: "artifyDB" })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));



const artworkSchema = new mongoose.Schema({
  image: String,
  title: String,
  category: String,
  medium: String,
  description: String,
  dimensions: String,
  price: Number,
  visibility: { type: String, enum: ["public", "private"], default: "public" },
  userName: String,
  userEmail: String,
  likes: { type: Number, default: 0 },
  likedBy: { type: [String], default: [] },
  artistPhoto: String,
  createdAt: { type: Date, default: Date.now },
});

const Artwork = mongoose.model("Artwork", artworkSchema);

const favoriteSchema = new mongoose.Schema({
  artworkId: { type: mongoose.Schema.Types.ObjectId, ref: "Artwork" },
  userEmail: String,
  createdAt: { type: Date, default: Date.now },
});

const Favorite = mongoose.model("Favorite", favoriteSchema);



app.get("/", (req, res) => {
  res.send("✅ Artify backend running");
});


app.post("/artworks", async (req, res) => {
  try {
    const saved = await new Artwork(req.body).save();
    res.status(201).json(saved);
  } catch (err) {
    console.error("POST /artworks:", err);
    res.status(500).json({ message: "Server error" });
  }
});


app.get("/artworks", async (req, res) => {
  try {
    const { visibility, search, email, category } = req.query;

    const filter = {};
    if (visibility) filter.visibility = visibility;
    if (email) filter.userEmail = email;
    if (category) filter.category = category;

    if (search) {
      const re = new RegExp(search, "i");
      filter.$or = [{ title: re }, { userName: re }, { category: re }];
    }

    const items = await Artwork.find(filter).sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    console.error("GET /artworks:", err);
    res.status(500).json({ message: "Server error" });
  }
});


app.get("/artworks/featured", async (req, res) => {
  try {
    const items = await Artwork.find({ visibility: "public" })
      .sort({ createdAt: -1 })
      .limit(6);
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


app.get("/artworks/:id", async (req, res) => {
  try {
    const item = await Artwork.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Not found" });

    const totalArtworks = await Artwork.countDocuments({
      userEmail: item.userEmail,
    });

    res.json({ ...item.toObject(), totalArtworks });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


app.patch("/artworks/:id", async (req, res) => {
  try {
    const updated = await Artwork.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


app.patch("/artworks/:id/like", async (req, res) => {
  try {
    const { userEmail } = req.body;
    const artwork = await Artwork.findById(req.params.id);

    if (!artwork) {
      return res.status(404).json({ message: "Artwork not found" });
    }

    let liked;

    // 👉 user already liked → UNLIKE
    if (artwork.likedBy.includes(userEmail)) {
      artwork.likes -= 1;
      artwork.likedBy.pull(userEmail);
      liked = false;
    }
    // 👉 user not liked yet → LIKE
    else {
      artwork.likes += 1;
      artwork.likedBy.push(userEmail);
      liked = true;
    }

    await artwork.save();

    res.json({
      likes: artwork.likes,
      liked,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});



app.delete("/artworks/:id", async (req, res) => {
  try {
    const result = await Artwork.deleteOne({ _id: req.params.id });
    res.json({ deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


app.post("/favorites", async (req, res) => {
  try {
    const { artworkId, userEmail } = req.body;

    const exists = await Favorite.findOne({ artworkId, userEmail });
    if (exists) return res.json({ message: "Already added" });

    const saved = await new Favorite({ artworkId, userEmail }).save();
    res.json(saved);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


app.get("/favorites", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.json([]);

    const docs = await Favorite.find({ userEmail: email }).populate(
      "artworkId"
    );

    
    const out = docs
      .filter((d) => d.artworkId) 
      .map((d) => ({
        _id: d._id,      
        artwork: d.artworkId, 
      }));

    res.json(out);
  } catch (err) {
    console.error("GET /favorites error:", err);
    res.status(500).json({ message: "Server error" });
  }
});



app.delete("/favorites/:id", async (req, res) => {
  try {
    const result = await Favorite.deleteOne({ _id: req.params.id });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/dashboard/stats", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ message: "Email required" });
    }

    const totalArtworks = await Artwork.countDocuments({
      userEmail: email,
    });

    const totalLikesAgg = await Artwork.aggregate([
      { $match: { userEmail: email } },
      { $group: { _id: null, totalLikes: { $sum: "$likes" } } },
    ]);

    const totalLikes = totalLikesAgg[0]?.totalLikes || 0;

    const totalFavorites = await Favorite.countDocuments({
      userEmail: email,
    });

    res.json({
      totalArtworks,
      totalLikes,
      totalFavorites,
    });
  } catch (err) {
    console.error("GET /dashboard/stats", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/dashboard/recent-artworks", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.json([]);

    const artworks = await Artwork.find({ userEmail: email })
      .sort({ createdAt: -1 })
      .limit(5);

    res.json(artworks);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/dashboard/category-stats", async (req, res) => {
  try {
    const { email } = req.query;

    const stats = await Artwork.aggregate([
      { $match: { userEmail: email } },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
    ]);

    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});



module.exports = app;


if (require.main === module) {
  app.listen(port, () => {
    console.log(`✅ Server running locally on port ${port}`);
  });
}
