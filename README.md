# CodeForge – AI-Powered Options Market Analytics Challenge

## Overview

Welcome to the **CodeForge FinTech Challenge**.

In this challenge, participants will build an **AI-powered analytics and visualization platform** that helps analyze derivatives options data and uncover meaningful patterns in market activity.

Options markets produce large volumes of high-frequency data across multiple dimensions such as **time, strike prices, expiries, trading volume, and open interest**. Extracting actionable insights from this complex data is challenging.

Your goal is to design a system that transforms raw options data into **clear visual insights and intelligent analytics**, helping users understand market behavior and identify potential opportunities.

---

## Challenge Goals

Participants are expected to build a platform that can:

- Process and structure large-scale options datasets
- Visualize options market activity across strikes, expiries, and time
- Identify patterns in **open interest, trading volume, and volatility**
- Detect anomalies or unusual activity in the derivatives market
- Use **AI or machine learning techniques** to analyze market behavior

The final solution should help users explore options market data and generate meaningful insights through **interactive dashboards and analytical tools**.

---

## Repository Structure
codeforge-options-analytics/

data/ # Dataset and metadata
notebooks/ # Exploratory analysis notebook
src/ # Core source code modules
scripts/ # Scripts to run applications
README.md # Project overview
PROBLEM_STATEMENT.md
requirements.txt


---

## Dataset

The dataset provided in the `data/` folder contains historical options market information.

Example columns include:

| Column | Description |
|------|-------------|
| datetime | Timestamp of the observation |
| expiry | Option expiry date |
| strike | Strike price |
| spot_close | Underlying asset price |
| oi_CE | Call option open interest |
| oi_PE | Put option open interest |
| volume_CE | Call option trading volume |
| volume_PE | Put option trading volume |
| ATM | At-the-money strike |

Participants are encouraged to perform additional feature engineering to extract useful signals from the dataset.

---

## Getting Started

### 1. Clone the Repository

git clone <repository-url>
cd codeforge-options-analytics


### 2. Install Dependencies


pip install -r requirements.txt


### 3. Run the Example Dashboard


python scripts/run_dashboard.py


This will launch a simple starter dashboard built using **Streamlit**.

Participants are expected to expand this dashboard with additional visualizations and analytics.

---

## What Participants Should Build

Teams should extend the repository to develop:

- Interactive **data visualizations**
- Strike-wise analysis of **open interest and volume**
- **Volatility analysis tools**
- **AI or machine learning models** to detect patterns
- **Anomaly detection systems** for unusual options activity
- Intuitive **analytics dashboards**

The goal is to transform raw derivatives data into **actionable insights for traders and analysts**.

---

## Use of Free and Open Source Software (FOSS)

A core objective of this event is to promote the use of **Free and Open Source Software (FOSS)**.

Participants will be **significantly evaluated based on how effectively they use FOSS tools and frameworks in their solution**.

Examples of recommended open-source technologies include:

### Data Analysis
- Python
- Pandas
- NumPy

### Machine Learning
- Scikit-learn
- PyTorch
- TensorFlow

### Visualization
- Plotly
- Matplotlib
- D3.js

### Dashboard Development
- Streamlit
- Dash
- React

### Data Infrastructure
- PostgreSQL
- DuckDB
- Apache Spark

Teams that creatively leverage open-source ecosystems or build reusable open tools will receive additional consideration during evaluation.

---

## Evaluation Criteria

Submissions will be evaluated based on the following factors:

### Visualization Quality
Clarity and effectiveness of visualizations in representing complex options data.

### Analytical Depth
Ability to uncover meaningful patterns in volatility, trading activity, or market structure.

### AI / Machine Learning Integration
Use of intelligent models for pattern detection, forecasting, or anomaly detection.

### Scalability
Ability to handle large datasets efficiently.

### User Experience
Ease of use, interactivity, and usability of the platform.

### Use of FOSS Tools
Effective and innovative use of open-source technologies.

### Innovation
Originality in analytics techniques, visualization design, or platform features.

---

## Submission Guidelines

Each team submission should include:

- Source code
- Documentation explaining the approach
- Instructions for running the solution
- Any trained models or additional data processing scripts

---

## Final Note

The purpose of this challenge is not only to build visual dashboards but to **extract meaningful insights from complex options market data using analytics and AI**.

Participants are encouraged to experiment, explore new ideas, and build innovative solutions that improve understanding of derivatives markets.

Good luck and happy building.
