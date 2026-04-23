# Deploy ProjectAutomata to Railway

## Quick Deployment Steps

### 1. Push Your Code to GitHub

```bash
# Initialize git (if not already done)
git init
git add .
git commit -m "Initial commit - ProjectAutomata frontend"

# Create a new repository on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/project-automata.git
git branch -M main
git push -u origin main
```

### 2. Deploy on Railway

1. **Go to Railway**
   - Visit [https://railway.app](https://railway.app)
   - Sign up/Login with your GitHub account

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your `project-automata` repository

3. **Configure the Service**
   - Railway will auto-detect it's a Node.js project
   - It will automatically use the `start` script from package.json
   - No additional configuration needed!

4. **Deploy**
   - Railway will build and deploy your app automatically
   - You'll get a public URL like: `https://your-project.railway.app`

### 3. Custom Domain (Optional)

1. Go to your project settings in Railway
2. Click "Domains"
3. Add your custom domain
4. Configure DNS records as instructed

## Project Structure

```
frontend/
├── server.js           # Node.js static file server
├── package.json        # Dependencies and scripts
├── index.html          # Main page
├── document.html       # Documentation page
├── team.html           # Team page
└── assets/             # Images, JS, CSS files
```

## How It Works

- **server.js**: Simple Node.js HTTP server that serves static files
- **Railway**: Automatically runs `npm start` which executes `node server.js`
- **PORT**: Railway sets the `PORT` environment variable automatically

## Local Testing

Before deploying, test locally:

```bash
npm install
npm start
```

Visit `http://localhost:3000` to see your app.

## Environment Variables

Railway automatically sets:
- `PORT`: The port your server should listen on
- `NODE_ENV`: Set to "production"

## Troubleshooting

### App not starting?
- Check Railway logs in the dashboard
- Ensure `npm start` works locally
- Verify all files are committed to Git

### Assets not loading?
- Check file paths in HTML files
- Ensure all assets are in the `assets/` folder
- Verify file names match exactly (case-sensitive)

### Port issues?
- Railway sets the PORT automatically
- server.js uses `process.env.PORT || 3000`
- Don't hardcode the port number

## Updates

After making changes:

```bash
git add .
git commit -m "Update description"
git push origin main
```

Railway will automatically redeploy with your changes!

## Free Tier Limits

Railway's free tier includes:
- 500 hours/month
- 1GB RAM
- Shared CPU
- Perfect for small projects like this!

## Need More Help?

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
