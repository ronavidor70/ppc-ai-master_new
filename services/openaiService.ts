
import OpenAI from "openai";
import { CampaignStrategy, AdCreative, Platform, Language, LandingPage, Campaign } from "../types";

// Function to get the OpenAI client
const getAiClient = () => {
  // Support both Vite (import.meta.env) and Node.js (process.env) environments
  const apiKey = 
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENAI_API_KEY) ||
    (typeof import.meta !== 'undefined' && import.meta.env?.OPENAI_API_KEY) ||
    (typeof process !== 'undefined' && process.env?.OPENAI_API_KEY) ||
    (typeof process !== 'undefined' && process.env?.API_KEY);
  
  // Debug: Check if API key is loaded (only in development)
  if (typeof window !== 'undefined') {
    console.log('OpenAI API Key loaded:', apiKey ? `${apiKey.substring(0, 15)}...` : 'NOT FOUND');
    if (!apiKey) {
      console.warn('⚠️ OPENAI_API_KEY not found. Please create a .env file with: OPENAI_API_KEY=sk-...');
    }
  }
  
  if (!apiKey || apiKey === 'undefined' || apiKey === 'null') {
    throw new Error('OPENAI_API_KEY is not defined. Please create a .env file with OPENAI_API_KEY=sk-... and restart the server.');
  }
  
  try {
    return new OpenAI({ 
      apiKey,
      dangerouslyAllowBrowser: true // Allow OpenAI to run in browser environment
    });
  } catch (error) {
    console.error('Error creating OpenAI client:', error);
    throw new Error('Failed to initialize OpenAI client. Please check your API key.');
  }
};

export const openaiService = {
  // Generates a comprehensive campaign strategy
  async generateStrategy(prompt: string, lang: Language): Promise<CampaignStrategy> {
    try {
      const client = getAiClient();
      const response = await client.chat.completions.create({
        model: "gpt-4o", // Most powerful OpenAI model
        messages: [
          {
            role: "system",
            content: `You are an expert PPC Manager. Create detailed campaign strategies. Always respond in valid JSON format. ${lang === 'he' ? 'Provide all text content strictly in Hebrew.' : 'Provide all text content in English.'}`
          },
          {
            role: "user",
            content: `User request: ${prompt}. Create a detailed campaign strategy. Include platform selection, suggested monthly budget, target audience description, and the reasoning. Supported platforms: Facebook, Google, LinkedIn, Taboola, TikTok, and X. 
            
            Respond with a JSON object with these exact fields:
            {
              "name": "campaign name",
              "platforms": ["platform1", "platform2"],
              "suggestedBudget": number,
              "targetAudience": "description",
              "reasoning": "explanation"
            }`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
      });

      const content = response.choices[0]?.message?.content || '{}';
      return JSON.parse(content);
    } catch (error: any) {
      console.error('Error generating strategy:', error);
      throw new Error(`Failed to generate strategy: ${error.message || 'Unknown error'}`);
    }
  },

  // Generates ad creatives based on strategy
  async generateAdCreatives(strategy: CampaignStrategy, lang: Language): Promise<AdCreative[]> {
    const client = getAiClient();
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert copywriter for PPC ads. Generate high-converting ad creatives. Always respond in valid JSON format. ${lang === 'he' ? 'Provide all text content strictly in Hebrew.' : 'Provide all text content in English.'}`
        },
        {
          role: "user",
          content: `Generate 3 high-converting ad creatives for the following strategy: ${JSON.stringify(strategy)}. 
          
          Respond with a JSON object containing a "creatives" array:
          {
            "creatives": [
              {
                "headline": "ad headline",
                "description": "ad description",
                "cta": "call to action"
              }
            ]
          }`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.8,
    });

    const content = response.choices[0]?.message?.content || '{"creatives": []}';
    const parsed = JSON.parse(content);
    return parsed.creatives || [];
  },

  // Generates ad images using DALL-E 3 (OpenAI's image generation)
  async generateAdImage(userPrompt: string, style: string, lang: Language): Promise<string> {
    const client = getAiClient();
    
    // Step 1: Optimize the prompt for DALL-E
    const optimizationResponse = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert at creating detailed image generation prompts for DALL-E 3."
        },
        {
          role: "user",
          content: `Translate and optimize this image request for a professional ad. 
          Input: ${userPrompt} 
          Style: ${style}
          Rules:
          1. Write a highly detailed English prompt for a high-end commercial photo/graphic suitable for DALL-E 3.
          2. If there is text in the input (especially Hebrew), describe how it should appear visually.
          3. Focus on aesthetics, premium lighting, and commercial appeal.
          4. Keep the prompt under 400 characters (DALL-E 3 limit).`
        }
      ],
      temperature: 0.7,
    });

    const optimizedPrompt = optimizationResponse.choices[0]?.message?.content || userPrompt;

    // Step 2: Generate the image with DALL-E 3
    const imageResponse = await client.images.generate({
      model: "dall-e-3",
      prompt: optimizedPrompt,
      size: "1024x1024",
      quality: "standard",
      n: 1,
    });

    const imageUrl = imageResponse.data[0]?.url;
    if (!imageUrl) {
      throw new Error("No image URL received from DALL-E API");
    }
    
    return imageUrl;
  },

  // Provides platform-specific suggestions for the wizard
  async getPlatformSuggestions(platform: Platform, productDescription: string, lang: Language): Promise<any> {
    const client = getAiClient();
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a PPC expert. Provide platform-specific targeting suggestions. Always respond in valid JSON format. ${lang === 'he' ? 'Provide all text content strictly in Hebrew.' : 'Provide all text content in English.'}`
        },
        {
          role: "user",
          content: `As a PPC expert, provide platform-specific targeting suggestions for ${platform} based on this product: ${productDescription}. 
          If Google Ads, provide keyword suggestions. If Meta/TikTok, provide interest/audience suggestions.
          Include a "proTip" for success.
          
          Respond with a JSON object:
          {
            "proTip": "tip text",
            "suggestions": [
              {
                "item": "keyword/interest name",
                "metadata": "additional info",
                "reason": "why this is good"
              }
            ]
          }`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content || '{}';
    return JSON.parse(content);
  },

  // Analyzes campaign performance
  async getAiInsight(campaignData: any, lang: Language): Promise<string> {
    const client = getAiClient();
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a PPC optimization expert. Provide clear, actionable insights. ${lang === 'he' ? 'Respond in Hebrew.' : 'Respond in English.'}`
        },
        {
          role: "user",
          content: `Analyze performance: ${JSON.stringify(campaignData)}. Provide one clear optimization step.`
        }
      ],
      temperature: 0.7,
    });
    
    return response.choices[0]?.message?.content || '';
  },

  // Optimizes campaign budget and strategy
  async optimizeCampaign(campaign: Campaign, lang: Language): Promise<{ suggestedBudget: number, reasoning: string }> {
    const client = getAiClient();
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a PPC optimization expert. Provide budget optimization recommendations. Always respond in valid JSON format. ${lang === 'he' ? 'Provide all text content strictly in Hebrew.' : 'Provide all text content in English.'}`
        },
        {
          role: "user",
          content: `Optimize campaign: ${JSON.stringify(campaign)}. 
          
          Respond with a JSON object:
          {
            "suggestedBudget": number,
            "reasoning": "explanation"
          }`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });
    
    const content = response.choices[0]?.message?.content || '{}';
    return JSON.parse(content);
  },

  async generateLandingPageVariations(topic: string, lang: Language): Promise<Partial<LandingPage>[]> {
    const client = getAiClient();
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert landing page designer. Create landing page variations. Always respond in valid JSON format. ${lang === 'he' ? 'Provide all text content strictly in Hebrew.' : 'Provide all text content in English.'}`
        },
        {
          role: "user",
          content: `Create 3 landing page variations for the topic: "${topic}". 
          
          Respond with a JSON object containing a "variations" array:
          {
            "variations": [
              {
                "title": "page title",
                "content": {
                  "hero": {
                    "title": "hero title",
                    "subtitle": "hero subtitle",
                    "cta": "call to action"
                  },
                  "features": [
                    {
                      "title": "feature title",
                      "description": "feature description"
                    }
                  ]
                }
              }
            ]
          }`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.8,
    });

    const content = response.choices[0]?.message?.content || '{"variations": []}';
    const parsed = JSON.parse(content);
    return parsed.variations || [];
  }
};
