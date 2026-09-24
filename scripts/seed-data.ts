// MCQ-only questions ported from the legacy `Campus Assessment/public/index wout.html`.
// The old app's free-text "debugging/output/concept" textarea questions relied on a
// mini compiler-adjacent flow that this platform intentionally drops (MCQ-only, per
// the phase-1 scope) - only genuine multiple-choice items are carried over here.

export interface SeedQuestion {
  text: string;
  options: string[];
  correctIndex: number;
}

export const APTITUDE_QUESTIONS: SeedQuestion[] = [
  { text: "If the average of 8 numbers is 45 and the average of first 5 numbers is 42, what is the average of the last 3 numbers?", options: ["48", "50", "52", "55"], correctIndex: 2 },
  { text: "A company increases its employee count by 20% in the first year and decreases it by 10% in the second year. What is the net percentage change?", options: ["8% increase", "10% increase", "12% increase", "5% increase"], correctIndex: 0 },
  { text: "The ratio of two numbers is 7 : 9. If their LCM is 630, what is their HCF?", options: ["7", "9", "10", "14"], correctIndex: 2 },
  { text: "A data report shows that sales increased from 480 units to 600 units. What is the percentage increase?", options: ["20%", "25%", "30%", "35%"], correctIndex: 1 },
  { text: "A project is completed by 6 employees in 15 days. How many days will 10 employees take?", options: ["6 days", "7 days", "9 days", "12 days"], correctIndex: 2 },
  { text: "Find the next number in the series: 3, 9, 27, 81, ___", options: ["162", "243", "324", "729"], correctIndex: 1 },
  { text: "If DATA is written as GDXD, how is CODE written?", options: ["FRHH", "FRHG", "FRGH", "ERHH"], correctIndex: 0 },
  { text: "All analysts are graduates. Some graduates are programmers. Which conclusion follows?", options: ["Only 1 follows", "Only 2 follows", "Both follow", "None follow"], correctIndex: 3 },
  { text: "If South-East becomes North, North-East becomes West, then what will West become?", options: ["North-East", "South-West", "South-East", "East"], correctIndex: 2 },
  { text: "Find the odd one out", options: ["Facebook", "Instagram", "WhatsApp", "Google Maps"], correctIndex: 3 },
  { text: "A marketing campaign produced 1200 leads. 40% converted to trials and 25% of trials converted to customers. Customers generated?", options: ["100", "120", "150", "180"], correctIndex: 1 },
  { text: "A website's daily visitors increased by 15% on Monday and decreased by 10% on Tuesday. Sunday visitors were 2000. Visitors on Tuesday?", options: ["2050", "2070", "2100", "2150"], correctIndex: 1 },
  { text: "A company spends 30% budget on ads, 25% on salaries, 15% on tools and remaining ₹3,00,000 on operations. Find total budget.", options: ["₹8,00,000", "₹10,00,000", "₹12,00,000", "₹15,00,000"], correctIndex: 2 },
  { text: "Five friends A, B, C, D, E sit in a row. A is left of B. C is right of B but left of D. E is right of D. Who sits in the middle?", options: ["A", "B", "C", "D"], correctIndex: 2 },
  { text: "If the price of a product is increased by 25% and then decreased by 20%, what is the net change?", options: ["No change", "15% increase", "5% decrease", "10% increase"], correctIndex: 0 },
  { text: "Choose the correct synonym for Mitigate", options: ["Increase", "Reduce", "Confuse", "Expand"], correctIndex: 1 },
  { text: "Choose the correct sentence", options: ["Each of the students have completed the task", "Each of the students has completed the task", "Each of the student have completed the task", "Each of students has completed the task"], correctIndex: 1 },
  { text: "Choose the correct analogy: Data : Information :: Pixel : ?", options: ["Image", "Screen", "Resolution", "Color"], correctIndex: 0 },
  { text: "Find the correct order of words: Analyze, Collect, Interpret, Present", options: ["2 → 1 → 3 → 4", "1 → 2 → 3 → 4", "2 → 3 → 1 → 4", "3 → 1 → 2 → 4"], correctIndex: 0 },
  { text: "A digital campaign CTR increased from 4% to 5%. What is percentage increase in CTR?", options: ["20%", "25%", "30%", "40%"], correctIndex: 1 },
];

export const FULLSTACK_QUESTIONS: SeedQuestion[] = [
  { text: "In Node.js, which module is used to create a server without Express?", options: ["fs", "http", "url", "net"], correctIndex: 1 },
  { text: "In Express.js, what does `next()` do?", options: ["Ends the request-response cycle", "Skips middleware", "Passes control to the next middleware", "Restarts the request"], correctIndex: 2 },
  { text: "What is the default port for MongoDB?", options: ["27017", "3306", "5432", "8080"], correctIndex: 0 },
  { text: "Which HTTP method is idempotent?", options: ["POST", "PATCH", "DELETE", "PUT"], correctIndex: 3 },
  { text: "In JWT authentication, where is the token typically stored on the client?", options: ["Server RAM", "Database", "LocalStorage or cookies", "Compiler memory"], correctIndex: 2 },
  { text: "What does `npm ci` do differently from `npm install`?", options: ["Installs latest versions", "Deletes node_modules and installs exact versions from lock file", "Only installs dev dependencies", "Skips dependencies"], correctIndex: 1 },
  { text: "Which SQL operation is used to combine rows from two tables based on a related column?", options: ["MERGE", "JOIN", "UNION", "GROUP BY"], correctIndex: 1 },
  { text: "What is the purpose of rate limiting in APIs?", options: ["Improve UI performance", "Prevent abuse and DDoS attacks", "Reduce code size", "Increase database speed"], correctIndex: 1 },
  { text: "Which tool is commonly used for containerization?", options: ["Git", "Docker", "Webpack", "Babel"], correctIndex: 1 },
];

export const DATA_SCIENCE_QUESTIONS: SeedQuestion[] = [
  { text: "What is the primary difference between bagging and boosting ensemble methods?", options: ["Bagging builds models sequentially; boosting builds them in parallel", "Bagging builds models in parallel on random subsets; boosting builds models sequentially correcting errors", "Boosting only works with decision trees; bagging works with any model", "They are identical but differ in naming convention"], correctIndex: 1 },
  { text: "Which metric is most appropriate for evaluating a classification model on a severely imbalanced dataset?", options: ["Accuracy", "F1-Score or AUC-ROC", "Mean Squared Error", "R-Squared"], correctIndex: 1 },
  { text: "In the context of deep learning, what does the vanishing gradient problem cause?", options: ["Weights in early layers update very slowly because gradients shrink exponentially", "The model learns too fast and overfits", "The output layer loses all its weights", "Batch normalization fails"], correctIndex: 0 },
  { text: "Which Apache Spark operation is a wide transformation that causes a shuffle across partitions?", options: ["map()", "filter()", "groupByKey()", "flatMap()"], correctIndex: 2 },
  { text: "What is the purpose of the learning rate scheduler in model training?", options: ["To increase the batch size over time", "To adaptively reduce the learning rate to help convergence", "To shuffle training data between epochs", "To regularize weights using L2 penalty"], correctIndex: 1 },
  { text: "In a machine learning pipeline, what does data leakage refer to?", options: ["Training data being stored insecurely", "Information from the test set inadvertently influencing model training", "Overfitting caused by too many features", "Missing values in the validation set"], correctIndex: 1 },
  { text: "Which SQL window function would you use to calculate a running total over an ordered partition?", options: ["GROUP BY with SUM", "SUM() OVER (ORDER BY ...)", "RANK() OVER (PARTITION BY ...)", "CUMSUM() with WHERE clause"], correctIndex: 1 },
  { text: "What is the purpose of KL Divergence in machine learning?", options: ["To measure Euclidean distance between two vectors", "To measure how one probability distribution diverges from a reference distribution", "To compute the gradient of a loss function", "To regularize weights in neural networks"], correctIndex: 1 },
  { text: "In MLOps, which tool is primarily used for experiment tracking, model versioning, and a model registry?", options: ["Apache Airflow", "MLflow", "Kubernetes", "dbt"], correctIndex: 1 },
  { text: "What does SHAP (SHapley Additive exPlanations) provide in machine learning model interpretation?", options: ["Model accuracy on test data", "A consistent, fair attribution of each feature's contribution to a prediction", "Hyperparameter tuning recommendations", "Data augmentation suggestions"], correctIndex: 1 },
];

export const DIGITAL_MARKETING_QUESTIONS: SeedQuestion[] = [
  { text: "Which Google Ads bidding strategy should you use when you want to maximize conversions while staying within a specific cost-per-acquisition target?", options: ["Maximize Clicks", "Target CPA (Cost Per Acquisition)", "Manual CPC", "Viewable CPM"], correctIndex: 1 },
  { text: "What does a 'Quality Score' in Google Ads directly impact?", options: ["Only your ad's visual design", "Your Ad Rank and the actual CPC you pay", "Your daily budget allocation", "The number of keywords you can target"], correctIndex: 1 },
  { text: "In Google Analytics 4 (GA4), what replaced the concept of 'sessions' as the primary measurement model?", options: ["Pageviews", "Events-based measurement model", "Goals", "Hit-based tracking"], correctIndex: 1 },
  { text: "Which formula correctly calculates Return on Ad Spend (ROAS)?", options: ["(Revenue - Ad Spend) / Ad Spend × 100", "Revenue / Ad Spend", "Ad Spend / Revenue × 100", "(Clicks / Impressions) × 100"], correctIndex: 1 },
  { text: "What is the primary purpose of UTM parameters in a marketing campaign URL?", options: ["To speed up the landing page", "To track the source, medium, and campaign in analytics tools", "To encrypt the URL for security", "To improve SEO ranking"], correctIndex: 1 },
  { text: "In Facebook Ads, what does 'lookalike audience' targeting use as its basis?", options: ["Keywords from website content", "An existing custom audience to find similar users", "Random demographic data", "Competitor's follower list"], correctIndex: 1 },
  { text: "What is the difference between 'reach' and 'impressions' in social media advertising?", options: ["They are identical metrics", "Reach = unique users who saw the ad; Impressions = total times the ad was displayed", "Impressions = unique users; Reach = total ad displays", "Reach counts clicks; Impressions count video views"], correctIndex: 1 },
  { text: "Which Core Web Vital metric directly measures the time from a user's first interaction to when the browser responds?", options: ["Largest Contentful Paint (LCP)", "Cumulative Layout Shift (CLS)", "First Input Delay (FID) / Interaction to Next Paint (INP)", "Time to First Byte (TTFB)"], correctIndex: 2 },
  { text: "What does 'attribution modeling' solve in digital marketing analytics?", options: ["It improves ad creative quality", "It determines how credit for conversions is assigned to different touchpoints in the customer journey", "It calculates the total marketing budget", "It scores leads based on demographics"], correctIndex: 1 },
  { text: "Which SEO concept describes the value passed from one web page to another through hyperlinks?", options: ["Crawl Budget", "Link Equity (Link Juice / PageRank flow)", "Domain Authority", "Anchor Text Density"], correctIndex: 1 },
];

export const AI_PRODUCT_DEV_QUESTIONS: SeedQuestion[] = [
  { text: "What is the key difference between RAG (Retrieval-Augmented Generation) and fine-tuning an LLM?", options: ["RAG changes model weights with domain knowledge; fine-tuning retrieves documents at inference", "Fine-tuning changes model weights; RAG retrieves external knowledge at inference time without changing weights", "RAG is only for image models; fine-tuning is for text models", "They are equivalent approaches to domain adaptation"], correctIndex: 1 },
  { text: "In a vector database used for semantic search, what does 'cosine similarity' measure?", options: ["The Euclidean distance between two embedding vectors", "The angle between two vectors, indicating directional similarity regardless of magnitude", "The dot product magnitude between two feature vectors", "The L2 norm difference between two embeddings"], correctIndex: 1 },
  { text: "Which technique is used to reduce LLM inference costs by combining multiple requests into a single forward pass?", options: ["Quantization", "Dynamic batching", "Pruning", "Knowledge distillation"], correctIndex: 1 },
  { text: "In prompt engineering, what is 'chain-of-thought' prompting designed to improve?", options: ["The speed of LLM inference", "The model's reasoning on complex multi-step problems by eliciting intermediate steps", "Token efficiency by reducing prompt length", "The model's ability to generate images"], correctIndex: 1 },
  { text: "When deploying an ML model as a REST API, what is the primary role of a model serving framework like TorchServe or Triton Inference Server?", options: ["To retrain models automatically", "To handle batching, concurrency, versioning, and GPU utilization efficiently at inference time", "To store model training checkpoints", "To visualize model performance metrics"], correctIndex: 1 },
  { text: "What problem does 'hallucination' refer to in LLM-based AI products, and which architecture most directly addresses it?", options: ["The model runs too slowly; solved by quantization", "The model generates plausible but factually incorrect content; addressed by RAG grounding responses to retrieved documents", "The model forgets previous context; solved by increasing context window", "The model produces biased outputs; solved by RLHF"], correctIndex: 1 },
  { text: "In the context of AI product evaluation, what does 'BLEU score' measure?", options: ["The perplexity of a language model", "The similarity between machine-generated and human reference translations", "The bias level in an AI system", "The latency of an inference endpoint"], correctIndex: 1 },
  { text: "What is 'quantization' in the context of optimizing LLMs for production deployment?", options: ["Reducing the number of layers in a model", "Reducing the numerical precision of model weights (e.g., FP32 to INT8) to decrease memory and increase speed", "Splitting a model across multiple GPUs", "Merging multiple fine-tuned models into one"], correctIndex: 1 },
];

export const ROLE_SEED_DATA = [
  { key: "fullstack", label: "Full Stack Developer", categoryName: "Full Stack Development", questions: FULLSTACK_QUESTIONS },
  { key: "aiproductdev", label: "AI Product Developer", categoryName: "AI Product Development", questions: AI_PRODUCT_DEV_QUESTIONS },
  { key: "datascienceengineer", label: "Data Science Engineer", categoryName: "Data Science & Engineering", questions: DATA_SCIENCE_QUESTIONS },
  { key: "digitalmarketing", label: "Digital Marketer", categoryName: "Digital Marketing", questions: DIGITAL_MARKETING_QUESTIONS },
];
